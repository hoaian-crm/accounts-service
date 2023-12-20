import { NestFactory } from '@nestjs/core';
import { configLogger } from 'crm-logger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(await configLogger());

  app.setGlobalPrefix('/api/v1');

  app.listen(process.env.APP_PORT || 3000, () => {
    console.log('App is listening on port ', process.env.APP_PORT || 3000);
  });
}
bootstrap();
