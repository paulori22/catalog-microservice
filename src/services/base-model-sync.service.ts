import {DefaultCrudRepository} from '@loopback/repository';
import {Message} from 'amqplib';
import {pick} from 'lodash';

export interface SyncOptions {
  repo: DefaultCrudRepository<any, any>;
  data: any;
  message: Message;
}

export abstract class BaseModelSyncService {
  protected async sync({repo, data, message}: SyncOptions) {
    const {id} = data || {};
    const event = this.getEvent(message);
    const entity = this.createEntity(data, repo);
    switch (event) {
      case 'created':
        await repo.create(entity);
        break;
      case 'updated':
        await this.updateOrCreate({repo, id, entity});
        break;
      case 'deleted':
        await repo.deleteById(id);
        break;
    }
  }

  protected getEvent(message: Message) {
    return message.fields.routingKey.split('.').slice(2)[0];
  }

  protected createEntity(data: any, repo: DefaultCrudRepository<any, any>) {
    return pick(data, Object.keys(repo.entityClass.definition.properties));
  }

  protected async updateOrCreate({
    repo,
    id,
    entity,
  }: {
    repo: DefaultCrudRepository<any, any>;
    id: string;
    entity: any;
  }) {
    const exists = await repo.exists(id);
    return exists ? repo.updateById(id, entity) : repo.create(entity);
  }
}
