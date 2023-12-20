import { Body, Controller, Post } from '@nestjs/common';
import { AccountService } from './account.service';
import { CreateAccountDto } from './dto/create';

@Controller('/accounts')
export class AccountController {
  constructor(private accountService: AccountService) {}

  @Post()
  async create(@Body() data: CreateAccountDto) {
    return await this.accountService.create(data);
  }
}
