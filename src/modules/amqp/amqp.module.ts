import { Module} from '@nestjs/common';
import { ClientService } from './amqp.service';

@Module({
  imports: [],
  providers: [ClientService],
  exports: [ClientService],
})
export class ClientModule {}
