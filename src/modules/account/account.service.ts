import {
  AppsV1Api,
  CoreV1Api,
  KubeConfig,
  KubernetesObject,
  KubernetesObjectApi,
  V1Namespace,
} from '@kubernetes/client-node';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MinioService } from 'crm-minio';
import { compile } from 'handlebars';
import * as yaml from 'js-yaml';
import { Repository } from 'typeorm';
import { Account } from './account.entity';
import { CreateAccountDto } from './dto/create';

@Injectable()
export class AccountService {
  private k8sApi: CoreV1Api;
  private k8sApp: AppsV1Api;
  constructor(
    @InjectRepository(Account)
    private accountRepository: Repository<Account>,
    private minioService: MinioService,
  ) {
    const kc = new KubeConfig();
    kc.loadFromDefault();
    this.k8sApi = kc.makeApiClient(CoreV1Api);
    this.k8sApp = kc.makeApiClient(AppsV1Api);
  }

  async upsertNameSpace(data: V1Namespace) {
    try {
      return await this.k8sApi.readNamespace(data.metadata.name);
    } catch (error) {
      return await this.k8sApi.createNamespace(data);
    }
  }

  async create(data: CreateAccountDto) {
    const account =
      (await this.accountRepository.findOne({
        where: { email: data.email },
      })) ||
      (await this.accountRepository.save(this.accountRepository.create(data)));
    await this.accountRepository.query(
      `create schema if not exists "${account.id}"`,
    );
    await this.upsertNameSpace({
      metadata: { name: account.id },
    });
    const templates = await this.minioService.readDir('k8s-infra', '', true);
    const created = await Promise.all(
      templates.map(async (template) => {
        const specContentStr = await this.minioService.readFile(
          'k8s-infra',
          template.name,
        );
        const specContent = compile(specContentStr.toString());
        try {
          const result = await this.apply(specContent(account), account.id);
          return result;
        } catch (error) {
          console.log('Failed too apply ns: ', template.name, error.message);
        }
      }),
    );
    return created;
  }

  async apply(
    specString: string,
    namespace: string,
  ): Promise<KubernetesObject[]> {
    const kc = new KubeConfig();
    kc.loadFromDefault();

    const client = KubernetesObjectApi.makeApiClient(kc);

    const specs: KubernetesObject[] = yaml.loadAll(specString);
    const validSpecs = specs.filter((s) => s && s.kind && s.metadata);
    const created: KubernetesObject[] = [];
    for (const spec of validSpecs) {
      // this is to convince the old version of TypeScript that metadata exists even though we already filtered specs
      // without metadata out
      spec.metadata = spec.metadata || {};
      spec.metadata.annotations = spec.metadata.annotations || {};
      spec.metadata.namespace = namespace;
      delete spec.metadata.annotations[
        'kubectl.kubernetes.io/last-applied-configuration'
      ];
      spec.metadata.annotations[
        'kubectl.kubernetes.io/last-applied-configuration'
      ] = JSON.stringify(spec);
      try {
        // try to get the resource, if it does not exist an error will be thrown and we will end up in the catch
        // block.
        await client.read(spec as any);
        // we got the resource, so it exists, so patch it
        //
        // Note that this could fail if the spec refers to a custom resource. For custom resources you may need
        // to specify a different patch merge strategy in the content-type header.
        //
        // See: https://github.com/kubernetes/kubernetes/issues/97423
        const response = await client.patch(
          spec,
          undefined,
          undefined,
          undefined,
          undefined,
          {
            headers: {
              'Content-Type': 'application/merge-patch+json',
            },
          },
        );
        created.push(response.body);
      } catch (e) {
        // we did not get the resource, so it does not exist, so create it
        const response = await client.create(
          spec,
          undefined,
          undefined,
          undefined,
          // {
          //   headers: {
          //     'Content-Type': 'application/merge-patch+json',
          //   },
          // },
        );
        created.push(response.body);
      }
    }

    return created;
  }
}
