import {DefaultCrudRepository, EntityNotFoundError} from '@loopback/repository';
import {Message} from 'amqplib';
import {pick} from 'lodash';
import {ValidatorService} from './validator.service';

export interface SyncOptions {
  repo: DefaultCrudRepository<any, any>;
  data: any;
  message: Message;
}

export interface SyncRelationOptions {
  id: string;
  repo: DefaultCrudRepository<any, any>;
  relationField: string;
  relationIds: string[];
  relationRepo: DefaultCrudRepository<any, any>;
  message: Message;
}

export abstract class BaseModelSyncService {
  constructor(public validateService: ValidatorService) {}

  protected async sync({repo, data, message}: SyncOptions) {
    const {id} = data || {};
    const event = this.getEvent(message);
    const entity = this.createEntity(data, repo);
    switch (event) {
      case 'created':
        await this.validateService.validate({
          data: entity,
          entityClass: repo.entityClass,
        });
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
    await this.validateService.validate({
      data: entity,
      entityClass: repo.entityClass,
      ...(exists && {options: {partial: true}}),
    });
    return exists ? repo.updateById(id, entity) : repo.create(entity);
  }

  async syncRelation({
    id,
    repo,
    relationField,
    relationIds,
    relationRepo,
    message,
  }: SyncRelationOptions) {
    const fieldsRelation = this.extractFieldsRelation(repo, relationField);
    const collection = await relationRepo.find({
      where: {
        or: relationIds.map(id_relation => ({id: id_relation})),
      },
      fields: fieldsRelation,
    });

    if (!collection.length) {
      const error = new EntityNotFoundError(
        relationRepo.entityClass,
        relationIds,
      );
      error.name = 'EntityNotFound';
      throw error;
    }

    const event = this.getEvent(message);
    if (event === 'attached') {
      await (repo as any).attachRelation(id, relationField, collection);
    }
  }

  protected extractFieldsRelation(
    repo: SyncRelationOptions['repo'],
    relationField: SyncRelationOptions['relationField'],
  ) {
    return Object.keys(
      repo.modelClass.definition.properties[relationField].jsonSchema.items
        .properties,
    ).reduce((obj: any, field: string) => {
      obj[field] = true;
      return obj;
    }, {});
  }
}
