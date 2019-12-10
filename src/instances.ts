import get from 'lodash/get';
import set from 'lodash/set';
import { SyntheticEvent } from 'react';
import { BehaviorSubject, combineLatest, Observable, Subscription } from 'rxjs';
import { debounceTime, map } from 'rxjs/operators';
import { TFormeerFieldMeta, TFormeerFieldOptions, TOnBlurHandler, TOnChangeHandler, TValidationError, TValidator } from './types';

export class FormeerField<Value = any> {

    private static instances: Record<string, FormeerField> = {};

    static getInstance<Value>(formeerInstance: Formeer, name: string, options?: TFormeerFieldOptions<Value>): FormeerField<Value> {
        if (!FormeerField.instances[name]) {
            FormeerField.instances[name] = new FormeerField<Value>(formeerInstance, name, options);
        }

        return FormeerField.instances[name];
    }

    private onBlurHandler!: TOnBlurHandler;
    private onChangeHandler!: TOnChangeHandler<Value>;

    private setError$: BehaviorSubject<TValidationError> = new BehaviorSubject<TValidationError>(void 0);
    private setIsTouched$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
    private setValue$: BehaviorSubject<Value | undefined> = new BehaviorSubject<Value | undefined>(void 0);

    private validator?: TValidator

    readonly name: string;

    readonly error$: Observable<TValidationError> = this.setError$.asObservable().pipe(
        debounceTime(150) // more debounce for Formeer::errors$()
    );
    readonly isTouched$: Observable<boolean> = this.setIsTouched$.asObservable();
    readonly value$: Observable<Value | undefined> = this.setValue$.asObservable();

    private runValidation(value: Value | undefined = this.setValue$.value): void {
        if (this.validator) {
            const newError = this.validator(value);
            this.setError$.next(newError);
        }
    }

    constructor(formeerInstance: Formeer, fieldName: string, options: TFormeerFieldOptions<Value> = {}) {
        const { initialValue, validator } = options;

        this.name = fieldName;

        if (initialValue !== void 0) {
            this.setValue$.next(initialValue);
        }

        this.validator = validator;

        formeerInstance.registerField(this);

        this.onBlurHandler = () => {
            this.setIsTouched$.next(true);
            this.runValidation();
        };
        this.onChangeHandler = ({ currentTarget }: SyntheticEvent<{ value: Value }>) => this.handleChange(currentTarget.value);
    };

    handleChange = (value: Value): void => {
        this.setValue$.next(value);

        this.runValidation(value);
    };

    meta$ = (debounceDelay: number = 150): Observable<TFormeerFieldMeta<Value>> => {
        return combineLatest([this.error$, this.isTouched$, this.value$])
            .pipe(
                debounceTime(debounceDelay),
                map(([error, touched, value]: [TValidationError, boolean, Value | undefined]): TFormeerFieldMeta<Value> => ({ error, touched, value }))
            );
    };

    setIsTouched = (value: boolean): void => {
        this.setIsTouched$.next(value);
    };

    get blurHandler(): TOnBlurHandler {
        return this.onBlurHandler;
    }

    get changeHandler(): TOnChangeHandler<Value>  {
        return this.onChangeHandler;
    }

}

export class Formeer<Values extends Record<string, any> = any> {

    private static instances: Record<string, Formeer> = {};

    static getInstance<Values>(name: string, initialValues?: Values): Formeer<Values> {
        if (!Formeer.instances[name]) {
            Formeer.instances[name] = new Formeer<Values>(name, initialValues);
        }

        return Formeer.instances[name];
    }

    private fieldNames: Array<string> = [];
    private subscriptions: Array<Subscription> = [];
    private values: Values = {} as Values;

    constructor(private name: string, initialValues?: Values) {
        if (initialValues !== void 0) {
            this.values = initialValues;
        }
    }

    destroy = (): void => {
        this.subscriptions.forEach((subscription: Subscription) => {
            if (subscription && !subscription.closed) {
                subscription.unsubscribe();
            }
        });

        this.subscriptions = [];
    };

    getFieldValue = get.bind(null, this.values);

    getValues = (): Values => {
        return this.values;
    };

    errors$ = (filter: Array<string> = []): Observable<Array<string>> => {
        const filteredNames = filter.length ? this.fieldNames.filter((name: string) => filter.includes(name)) : this.fieldNames;
        const errorStreams = filteredNames.map((name: string) => FormeerField.getInstance(this, name).error$);

        return combineLatest(errorStreams).pipe(
            map((errors: Array<TValidationError>) => errors.filter((error: TValidationError): error is string => !!error))
        );
    };

    registerField<Value = any>(fieldInstance: FormeerField<Value>): void {
        const subscriptions = [
            fieldInstance.value$.subscribe((value: Value | undefined) => this.setFieldValue(fieldInstance.name, value))
        ];

        this.subscriptions = this.subscriptions.concat(subscriptions);

        this.fieldNames.push(fieldInstance.name);
    }

    setFieldValue = set.bind(null, this.values);

    submitForm = () => {};

}
