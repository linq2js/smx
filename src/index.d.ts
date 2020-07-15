export const state: StateExports;
export const effect: EffectExports;

interface StateExports extends Function {
  (): StateRoot<any>;
  <T>(value: T | ((...args: any[]) => T)): StateRoot<T>;
  memo<T>(callback: () => T, deps?: any[]): T;
}

interface EffectExports extends Function {
  <TPayload, TResult>(): EffectInfer<TPayload, TResult>;
  <TPayload, TResult>(
    call: EffectCall | EffectCall[],
    options?: EffectOptions<TPayload>,
  ): EffectInfer<TPayload, TResult>;
  <TPayload, TResult>(
    call: () => EffectCall | EffectCall[],
    options?: EffectOptions<TPayload>,
  ): EffectInfer<TPayload, TResult>;
  <TPayload, TResult>(
    mutate: StateMutation | StateMutation[],
    options?: EffectOptions<TPayload>,
  ): EffectInfer<TPayload, TResult>;
  <TPayload, TResult>(
    mutate: () => StateMutation | StateMutation[],
    options?: EffectOptions<TPayload>,
  ): EffectInfer<TPayload, TResult>;
  <TPayload, TResult>(
    rule: Rule,
    options?: EffectOptions<TPayload>,
  ): EffectInfer<TPayload, TResult>;
  <TPayload, TResult>(
    generator: (payload?: TPayload) => TResult,
    options?: EffectOptions<TPayload>,
  ): EffectInfer<TPayload, TResult>;
  <TResult>(
    generator: (payload?: any) => TResult,
    options?: EffectOptions<any>,
  ): EffectInfer<any, TResult>;
}

type AsyncEffectType = 'async';

type EffectInfer<TPayload, TResult> = TResult extends Promise<infer U>
  ? Effect<TPayload, Promise<void>>
  : EffectAsyncTypeInfer<TPayload, TResult>;

type EffectAsyncTypeInfer<TPayload, TResult> = TResult extends AsyncEffectType
  ? Effect<TPayload, Promise<void>>
  : EffectAsyncIteratorTypeInfer<TPayload, TResult>;

type EffectAsyncIteratorTypeInfer<
  TPayload,
  TResult
> = TResult extends AsyncIterableIterator<infer T>
  ? Effect<TPayload, Promise<void>>
  : Effect<TPayload, void>;

interface EffectExecutor<TPayload, TResult> extends Function {
  (payload?: TPayload): TResult;
}

interface Effect<TPayload, TResult> extends EffectExecutor<TPayload, TResult> {
  value(): TResult;
  loadable(): LoadableInfer<TResult>;
  cancel(rule: string): Effect<TPayload, TResult>;
  /**
   * listen effect dispatching
   * @param listener
   */
  on(listener: DispatchListener): RemoveListener;

  run(payload?: TPayload): TResult;
  latest(): EffectExecutor<TPayload, TResult>;
  throttle(ms: number): EffectExecutor<TPayload, TResult>;
  debounce(ms: number): EffectExecutor<TPayload, void>;
}

interface StateRoot<T> extends State<T>, Function {
  /**
   * get family state
   * @param args
   */
  (...args: any[]): State<T>;
}

interface State<T> {
  /**
   * get current state value
   */
  value(): T;

  /**
   * remove family state
   */
  remove(): void;

  /**
   * get loadable obj for current state value
   */
  loadable(): LoadableInfer<T>;

  /**
   * listen state value changed
   * @param listener
   */
  on(listener: ChangeListener): RemoveListener;

  map<U>(mapper: Mapper<T, U>): State<U>;

  reset(): void;

  remove(): void;
}

interface Loadable<T> {
  state: 'loading' | 'hasValue' | 'hasError';
  error: any;
  value: T;
}

type Mapper<Source, Destination> = (source: Source) => Destination;

type AnyStateOrEffect = State<any> | Effect<any, any>;

type Rule =
  | [State<any>, Reducer<any>, any?]
  | [Effect<any, any>, any?]
  | [Function, ...any[]]
  | Rule[];

type LoadableInfer<T> = T extends Promise<infer U> ? Loadable<U> : Loadable<T>;

type Reducer<T> = T extends Promise<infer U>
  ? (value: U, payload?: any) => any
  : (value: T, payload?: any) => any;

type CallableExpression = AnyStateOrEffect[] | AnyStateOrEffect | Function;

type EffectOptions<TPayload> = {
  error?: CallableExpression;
  success?: CallableExpression;
  done?: CallableExpression;
  stateResolver?: (state: StateRoot<any>, payload?: TPayload) => State<any>;
};

type StateMutation = [State<any>, any, any?] | StateMutation[];

type EffectCall = [Effect<any, any>, any] | EffectCall[];

type ChangeListener = () => void;

type DispatchListener = () => void;

type RemoveListener = () => void;
