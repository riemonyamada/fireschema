import { FTypes } from '../../types/FTypes'
import { fadmin, fweb } from '../../types/_firestore'
import { GetDeep, Loc } from '../../types/_object'
import { getDeep } from '../../utils/_object'
import { $adapter, $schema, _createdAt, _updatedAt } from '../constants'
import { adapter } from '../factories'
import { STypes } from '../STypes'

const getLoc = (parentOrRoot: FTypes.DocumentRef<unknown>) =>
  parentOrRoot.path.split('/').filter((_, i) => i % 2 === 0)

type GetDocT<
  D extends 'root' | FTypes.DocumentRef<unknown>
> = D extends FTypes.DocumentRef<infer T> ? T : never

type GetSchemaT<
  Options extends STypes.CollectionOptions.Meta,
  SOptions = Options[typeof $schema]
> = SOptions extends STypes.DataSchemaOptionsWithType<unknown>
  ? SOptions['__T__']
  : SOptions extends STypes.DataSchemaOptionsWithType<unknown>[]
  ? SOptions[number]['__T__']
  : never

const getAdapted = <
  F extends FTypes.FirestoreApp,
  L extends string[],
  Options extends STypes.CollectionOptions.Meta
>(
  collectionOptions: Options,
  collectionRef: FTypes.Query<any, F>,
) => {
  const adapted =
    collectionOptions[$adapter]?.(collectionRef) ?? adapter()({})(collectionRef)

  const select = adapted.select as STypes.Selectors<L, GetSL<Options>, F>

  return {
    select,
  }
}

type OmitLast<T extends any[]> = T extends [
  ...(infer U extends any[] ? infer U : never),
  unknown,
]
  ? U
  : never

type GetParentT<
  S extends STypes.RootOptions.All,
  T extends STypes.HasLoc<string[]>,
  L extends string[] = OmitLast<T['__loc__']>,
  _Options = GetDeep<S, L>
> = SchemaTWithLoc<EnsureOptions<_Options>, L>

type Parent = 'root' | FTypes.DocumentRef<STypes.HasLoc<string[]>>

type EnsureOptions<_Options> = _Options extends STypes.CollectionOptions.Meta
  ? _Options
  : never

type GetL<P extends Parent, C> = [...GetPL<P>, C]
type GetPL<P extends Parent> = P extends 'root' ? [] : GetDocT<P>['__loc__']

type GetSL<
  Options extends STypes.CollectionOptions.Meta
> = Options[typeof $adapter] extends null
  ? {}
  : NonNullable<Options[typeof $adapter]>['__SL__']

type SchemaTWithLoc<
  Options extends STypes.CollectionOptions.Meta,
  L extends string[]
> = GetSchemaT<Options> & STypes.HasLoc<L>

type CollectionController<
  F extends FTypes.FirestoreApp,
  S extends STypes.RootOptions.All
> = {
  collection: <
    P extends Parent,
    C extends keyof POptions & string,
    POptions = GetDeep<S, GetPL<P>>
  >(
    parent: P,
    collectionPath: C,
  ) => {
    ref: FTypes.CollectionRef<
      STypes.DocumentMeta<F> &
        SchemaTWithLoc<EnsureOptions<POptions[C]>, GetL<P, C>>,
      F
    >
    select: STypes.Selectors<GetL<P, C>, GetSL<EnsureOptions<POptions[C]>>, F>
  }
  collectionGroup: <L extends Loc<S>, _Options = GetDeep<S, L>>(
    loc: L,
  ) => {
    query: FTypes.Query<
      STypes.DocumentMeta<F> & SchemaTWithLoc<EnsureOptions<_Options>, L>,
      F
    >
    select: STypes.Selectors<L, GetSL<EnsureOptions<_Options>>, F>
  }
}

const getCollection = <
  F extends FTypes.FirestoreApp,
  P extends Parent,
  Options extends STypes.CollectionOptions.Meta,
  L extends string[]
>(
  app: F,
  parent: P,
  schemaOptions: STypes.RootOptions.All,
  collectionPath: string,
) => {
  const appOrParent = (parent === 'root' ? app : parent) as P extends 'root'
    ? F
    : FTypes.DocumentRef<GetDocT<P>, F>

  const parentLoc = (parent === 'root' ? [] : getLoc(parent as any)) as GetPL<P>

  const loc = [...parentLoc, collectionPath] as L
  const collectionOptions = (getDeep(
    schemaOptions,
    loc as any,
  ) as unknown) as Options

  const collectionRef = appOrParent.collection(
    collectionPath,
  ) as FTypes.CollectionRef<
    STypes.DocumentMeta<F> & SchemaTWithLoc<Options, L>,
    F
  >

  return { collectionOptions, collectionRef }
}

const buildCollectionController = <
  F extends FTypes.FirestoreApp,
  S extends STypes.RootOptions.All
>(
  app: F,
  schemaOptions: S,
): CollectionController<F, S> => {
  const collection = (<
    P extends Parent,
    C extends keyof POptions & string,
    POptions = GetDeep<S, GetPL<P>>
  >(
    parent: P,
    collectionPath: C,
  ) => {
    const { collectionOptions, collectionRef } = getCollection<
      F,
      P,
      EnsureOptions<POptions[C]>,
      GetL<P, C>
    >(app, parent, schemaOptions, collectionPath)

    const { select } = getAdapted<F, GetL<P, C>, EnsureOptions<POptions[C]>>(
      collectionOptions,
      collectionRef,
    )

    return { ref: collectionRef, select }
  }) as CollectionController<F, S>['collection']

  const collectionGroup: CollectionController<F, S>['collectionGroup'] = <
    L extends Loc<S>,
    _Options = GetDeep<S, L>
  >(
    loc: L,
  ) => {
    type Options = EnsureOptions<_Options>

    const collectionId = loc[loc.length - 1]
    const collectionOptions = (getDeep(
      schemaOptions,
      loc,
    ) as unknown) as Options

    const query = app.collectionGroup(collectionId) as FTypes.Query<
      STypes.DocumentMeta<F> & SchemaTWithLoc<Options, L>,
      F
    >
    const { select } = getAdapted<F, L, Options>(collectionOptions, query)

    return { query, select }
  }

  return { collection, collectionGroup }
}

export const initFirestore = <
  F extends FTypes.FirestoreApp,
  S extends STypes.RootOptions.All
>(
  { FieldValue, Timestamp }: typeof fweb | typeof fadmin,
  app: F,
  schemaOptions: S,
): FirestoreController<F, S> => {
  const _mergeOption = { merge: true }

  const _toCreate = <T>(data: {}) =>
    (({
      ...data,
      [_createdAt]: FieldValue.serverTimestamp(),
      [_updatedAt]: FieldValue.serverTimestamp(),
    } as any) as T)

  const _toUpdate = <T>(data: {}) =>
    (({
      ...data,
      [_updatedAt]: FieldValue.serverTimestamp(),
    } as any) as T)

  const parentOfCollection = <T extends STypes.HasLoc<string[]>>(
    collectionRef: FTypes.CollectionRef<T, F>,
  ) => {
    return (collectionRef.parent as unknown) as FTypes.DocumentRef<
      GetParentT<S, T>,
      F
    >
  }

  const { collection, collectionGroup } = buildCollectionController(
    app,
    schemaOptions,
  )

  const create = <T>(
    docRef: FTypes.DocumentRef<T, F>,
    data: STypes.DocDataToWrite<T, F>,
  ) => {
    const dataT = _toCreate<T>(data)
    return docRef.set(dataT, {}) as FTypes.SetResult<F>
  }

  const $create = <T>(
    transaction: FTypes.Transaction<F>,
    docRef: FTypes.DocumentRef<T, F>,
    data: STypes.DocDataToWrite<T, F>,
  ) => {
    const dataT = _toCreate<T>(data)
    ;(transaction as fweb.Transaction).set(docRef as any, dataT, {})
  }

  const setMerge = <T>(
    docRef: FTypes.DocumentRef<T, F>,
    data: Partial<STypes.DocDataToWrite<T, F>>,
  ) => {
    const dataT = _toUpdate<T>(data)
    return docRef.set(dataT, _mergeOption) as FTypes.SetResult<F>
  }

  const $setMerge = <T>(
    transaction: FTypes.Transaction<F>,
    docRef: FTypes.DocumentRef<T, F>,
    data: Partial<STypes.DocDataToWrite<T, F>>,
  ) => {
    const dataT = _toUpdate<T>(data)
    ;(transaction as fweb.Transaction).set(docRef as any, dataT, _mergeOption)
  }

  return {
    app,
    FieldValue: FieldValue as any,
    Timestamp: Timestamp as any,

    collection,
    collectionGroup,

    parentOfCollection: parentOfCollection as any,

    create,
    $create,
    setMerge,
    $setMerge,
  }
}

export type FirestoreController<
  F extends FTypes.FirestoreApp,
  S extends STypes.RootOptions.All
> = CollectionController<F, S> & {
  app: F
  FieldValue: FTypes.FieldValueClass<F>
  Timestamp: FTypes.TimestampClass<F>

  parentOfCollection: <T extends STypes.HasLoc<string[]>>(
    collectionRef: FTypes.CollectionRef<T, F>,
  ) => FTypes.DocumentRef<GetParentT<S, T>, F>

  create: <T>(
    docRef: FTypes.DocumentRef<T, F>,
    data: STypes.DocDataToWrite<T, F>,
  ) => FTypes.SetResult<F>
  $create: <T>(
    transaction: FTypes.Transaction<F>,
    docRef: FTypes.DocumentRef<T, F>,
    data: STypes.DocDataToWrite<T, F>,
  ) => void
  setMerge: <T>(
    docRef: FTypes.DocumentRef<T, F>,
    data: Partial<STypes.DocDataToWrite<T, F>>,
  ) => FTypes.SetResult<F>
  $setMerge: <T>(
    transaction: FTypes.Transaction<F>,
    docRef: FTypes.DocumentRef<T, F>,
    data: Partial<STypes.DocDataToWrite<T, F>>,
  ) => void
}
