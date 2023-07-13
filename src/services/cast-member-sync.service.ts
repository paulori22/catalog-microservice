import { /* inject, */ BindingScope, injectable} from '@loopback/core';
import {repository} from '@loopback/repository';
import {rabbitmqSubscribe} from '../decorators';
import {CastMember} from '../models';
import {CastMemberRepository} from '../repositories';

@injectable({scope: BindingScope.TRANSIENT})
export class CastMemberSyncService {
  constructor(
    @repository(CastMemberRepository) private castMemberRepo: CastMemberRepository,
  ) {}

  @rabbitmqSubscribe({
    exchange: 'amq.topic',
    queue: '',
    routingKey: 'model.castMember.*',
  })
  async handler({data, message}: {data: CastMember; message: ConsumeMessagemeMessage}) {
    console.log({data, message});
    const [event] = message.fields.routingKey.split('.').slice(2);
    switch (event) {
      case 'created':
        await this.castMemberRepo.create(data);
        break;
      case 'updated':
        await this.castMemberRepo.updateById(data.id, data);
        break;
      case 'deleted':
        await this.castMemberRepo.deleteById(data.id);
        break;
    }
  }
}
