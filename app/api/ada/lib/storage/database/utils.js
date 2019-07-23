// @flow

import type {
  lf$Database,
  lf$Row,
  lf$Transaction,
} from 'lovefield';
import { size } from 'lodash';

export async function addToTable<Insert, Row>(
  db: lf$Database,
  tx: lf$Transaction,
  request: Insert,
  tableName: string,
): Promise<Row> {
  const table = db.getSchema().table(tableName);
  const newRow = table.createRow(request);

  const result: Row = (await tx.attach(
    db
      .insertOrReplace()
      .into(table)
      .values(([newRow]: Array<lf$Row>))
  ))[0];

  return result;
}

export const getRowFromKey = async <T>(
  db: lf$Database,
  tx: lf$Transaction,
  key: number,
  tableName: string,
  keyRowName: string,
): Promise<T | void> => {
  const table = db.getSchema().table(tableName);
  const query = db
    .select()
    .from(table)
    .where(table[keyRowName].eq(key));
  const result = await tx.attach(query);
  if (result.length === 0) {
    return undefined;
  }
  return result[0];
};

export async function getRowIn<Row>(
  db: lf$Database,
  tx: lf$Transaction,
  tableName: string,
  keyRowName: string,
  list: Array<any>,
): Promise<Array<Row>> {
  const table = db.getSchema().table(tableName);
  const query = db
    .select()
    .from(table)
    .where(table[keyRowName].in(list));
  return await tx.attach(query);
}

/**
 * We have to wrap all functions that access database tables in a class
 * That way we can explicitly state which tables will be used by which functions
 * This is required because transactional queries in Lovefield
 * Need to know which tables will be accessed beforehand.
 * Getting the tables wrong will lead to either
 * - Deadlock if you lock a table which is already locked
 * - Runtime error if you access a table which is not locked
 */
export type Schema = {
  +name: string,
  properties: any;
};
export type OwnTableType = { [key: string]: Schema };
export type DepTableType = { [key: string]: TableClassType };
export type TableClassType = {
  +ownTables: OwnTableType,
  /**
   * Recursively specify which tables will be required
   * We need to recursivley store this information
   * That way each wrapper only needs to care about the tables it specifically will access
   * and not what its dependencies will require
   */
  +depTables: DepTableType,
}

/** recursively get all tables required for a database query */
export function getAllTables(tableClass: TableClassType): Set<string> {
  return new Set(_getAllTables(tableClass));
}

function _getAllTables(tableClass: TableClassType): Array<string> {
  const ownTables = Object.keys(tableClass.ownTables)
    .map(key => tableClass.ownTables[key])
    .map(schema => schema.name);
  if (size(tableClass.depTables) === 0) {
    return ownTables;
  }
  return ownTables.concat(
    ...Object.keys(tableClass.depTables)
      .map(key => tableClass.depTables[key])
      .map(clazz => _getAllTables(clazz))
  );
}
