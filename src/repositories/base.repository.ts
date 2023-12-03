import {DefaultCrudRepository, Entity} from '@loopback/repository';
import {Client} from 'es6';
import {pick} from 'lodash';
export class BaseRepository<
  T extends Entity,
  ID,
  Relations extends object = {},
> extends DefaultCrudRepository<T, ID, Relations> {
  async attachRelation(id: ID, relationField: string, data: object[]) {
    const document = {
      index: this.dataSource.settings.index,
      refresh: true,
      body: {
        query: {
          term: {
            _id: id,
          },
        },
        script: {
          source: `
            if( !ctx._source.containsKey('${relationField}') ){
              ctx._source['${relationField}'] = [];
            }
            for(item in params['${relationField}']){
              if( ctx._source['${relationField}'].find( i -> i.id == item.id ) == null ){
                ctx._source['${relationField}'].add(item);
              }
            }
          `,
          params: {
            [relationField]: data,
          },
        },
      },
    };

    const db: Client = this.dataSource.connector?.db;
    db.update_by_query(document);
  }

  async updateRelation(
    relationField: string,
    data: {id: any; [key: string]: any},
  ) {
    const fields = Object.keys(
      this.modelClass.definition.properties[relationField].jsonSchema.items
        .properties,
    );
    const relationData = pick(data, fields);
    const document = {
      index: this.dataSource.settings.index,
      refresh: true,
      body: {
        query: {
          bool: {
            must: [
              {
                nested: {
                  path: relationField,
                  query: {
                    exists: {
                      field: relationField,
                    },
                  },
                },
              },
              {
                nested: {
                  path: relationField,
                  query: {
                    term: {
                      [`${relationField}.id`]: relationData.id,
                    },
                  },
                },
              },
            ],
          },
        },
        script: {
          source: `
            ctx._source['${relationField}'].removeIf(i -> i.is == params['relationData']['id']);
            ctx._source['${relationField}'].add(params['relationData'])
          `,
          params: {
            relationData,
          },
        },
      },
    };

    const db: Client = this.dataSource.connector?.db;
    db.update_by_query(document);
  }
}
