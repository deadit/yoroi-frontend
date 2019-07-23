// @flow

import type {
  lf$Transaction,
  lf$Database,
} from 'lovefield';

import type {
  ConceptualWalletInsert,
} from '../database/uncategorized/tables';
import {
  AddConceptualWallet,
} from '../database/uncategorized/api/add';
import type {
  Bip44WrapperInsert,
} from '../database/genericBip44/tables';
import {
  AddBip44Wrapper,
  AddPrivateDeriver,
} from '../database/genericBip44/api/add';
import type {
  PrivateDeriverRequest,
} from '../database/genericBip44/api/add';
import {
  getAllTables,
} from '../database/utils';


type StateConstraint<CurrentState, Requirement, Input, Output> = $Call<
  (Requirement => Input => WalletBuilder<Output>) & () => {...},
  CurrentState
>

export class WalletBuilder<CurrentState> {
  db: lf$Database;
  tx: lf$Transaction;
  tables: Array<string>;
  buildSteps: Array<CurrentState => Promise<void>>;
  state: CurrentState;

  constructor(
    db: lf$Database,
    tx: lf$Transaction,
    tables: Array<string>,
    buildSteps: Array<CurrentState => Promise<void>>,
    state: CurrentState,
  ) {
    this.db = db;
    this.tx = tx;
    this.tables = tables;
    this.buildSteps = buildSteps;
    this.state = state;
  }

  updateData<NewAddition>(
    addition: NewAddition,
    newTables: Array<string>,
    newStep: (CurrentState & NewAddition) => Promise<void>,
  ): WalletBuilder<
    CurrentState & NewAddition
  > {
    return new WalletBuilder<
      CurrentState & NewAddition
    >(
      this.db,
      this.tx,
      this.tables.concat(newTables),
      this.buildSteps.concat(newStep),
      {
        ...this.state,
        ...addition,
      },
    );
  }

  static start(db: lf$Database): WalletBuilder<$Shape<{||}>> {
    return new WalletBuilder(
      db,
      db.createTransaction(),
      [],
      [],
      {},
    );
  }

  async commit(): Promise<CurrentState> {
    // lock used tables
    const usedTables = this.tables.map(
      name => this.db.getSchema().table(name)
    );
    await this.tx.begin(usedTables);

    // perform all insertions
    for (const step of this.buildSteps) {
      await step(this.state);
    }

    // commit result
    await this.tx.commit();

    return this.state;
  }

  addConceptualWallet: StateConstraint<
    CurrentState,
    {},
    CurrentState => ConceptualWalletInsert,
    CurrentState & HasConceptualWallet,
  > = (
    insert: CurrentState => ConceptualWalletInsert,
  ) => {
    return this.updateData(
      AsNotNull<HasConceptualWallet>({ conceptualWalletRow: null }),
      Array.from(getAllTables(AddConceptualWallet)),
      async (finalData) => {
        finalData.conceptualWalletRow = await AddConceptualWallet.func(
          this.db,
          this.tx,
          insert(finalData),
        );
      },
    );
  }

  addBip44Wrapper: StateConstraint<
    CurrentState,
    HasConceptualWallet,
    CurrentState => Bip44WrapperInsert,
    CurrentState & HasBip44Wrapper,
  > = (
    insert: CurrentState => Bip44WrapperInsert,
  ) => {
    return this.updateData(
      AsNotNull<HasBip44Wrapper>({ bip44WrapperRow: null }),
      Array.from(getAllTables(AddBip44Wrapper)),
      async (finalData) => {
        finalData.bip44WrapperRow = await AddBip44Wrapper.func(
          this.db,
          this.tx,
          insert(finalData),
        );
      },
    );
  }

  addPrivateDeriver: StateConstraint<
    CurrentState,
    HasBip44Wrapper,
    CurrentState => PrivateDeriverRequest<mixed>,
    CurrentState & HasPrivateDeriver
  > = <Insert>(
    insert: CurrentState => PrivateDeriverRequest<Insert>,
  ) => {
    return this.updateData(
      AsNotNull<HasPrivateDeriver>({ privateDeriver: null }),
      Array.from(getAllTables(AddPrivateDeriver)),
      async (finalData) => {
        finalData.privateDeriver = await AddPrivateDeriver.func(
          this.db,
          this.tx,
          insert(finalData),
        );
      },
    );
  }
}

/**
 * We need to insert null placeholder values into our builder during construction so that we can
 * properly typecheck which properties are available for the next construction step.
 * This data will be filled in once the transaction is called in `commit`
 *
 * When you chain builder steps, you don't want to have to null-check every step
 * since we know it will be filled once the lambda is called.
 * Therefore when we insert null values but coerce the type as if they are non-null and available.
 */
function AsNotNull<T: {}>(
  /** Assert argument is right type but with every field possibly null */
  data: $ObjMap<T, Nullable>
): T {
  // Note: return type is the non-null version if the argument
  return data;
}

type Nullable = <K>(K) => K | null;
// types to represent requirements
type HasConceptualWallet = {
  conceptualWalletRow: PromisslessReturnType<typeof AddConceptualWallet.func>
};
type HasBip44Wrapper = {
  bip44WrapperRow: PromisslessReturnType<typeof AddBip44Wrapper.func>
};
type HasPrivateDeriver = {
  privateDeriver: PromisslessReturnType<typeof AddPrivateDeriver.func>
};
