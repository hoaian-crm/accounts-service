import {
  AppsV1Api,
  CoreV1Api,
  KubeConfig,
  V1Namespace,
} from '@kubernetes/client-node';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
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
  ) {
    const kc = new KubeConfig();
    kc.loadFromDefault();
    this.k8sApi = kc.makeApiClient(CoreV1Api);
    this.k8sApp = kc.makeApiClient(AppsV1Api);
  }

  async upsertNameSpace(data: V1Namespace) {
    const namespace =
      (await this.k8sApi.readNamespace(data.metadata.name)) ??
      (await this.k8sApi.createNamespace(data));

    return namespace;
  }

  async create(data: CreateAccountDto) {
    const account = await this.accountRepository.findOne({
      where: { email: data.email },
    });
    const { body: namespace } = await this.upsertNameSpace({
      metadata: { name: account.id },
    });

    this.k8sApp.createNamespacedDeployment(namespace.metadata.name, {});
    return namespace;
  }
}
