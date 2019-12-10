import get from 'lodash/get';
import set from 'lodash/set';
import { SyntheticEvent } from 'react';
import { BehaviorSubject, combineLatest, Observable, Subscription } from 'rxjs';
import { debounceTime, map } from 'rxjs/operators';
import { TFormeerFieldMeta, TFormeerFieldOptions, TOnBlurHandler, TOnChangeHandler, TValidationError, TValidator, TFormeerOptions } from './types';

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

    private setIsSubmitting$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

    private fieldNames: Array<string> = [];
    private submitHandler?: TFormeerOptions<Values>['onSubmit'];
    private subscriptions: Array<Subscription> = [];
    private values: Values = {} as Values;

    readonly isSubmitting$: Observable<boolean> = this.setIsSubmitting$.asObservable();

    constructor(private name: string, options: TFormeerOptions<Values> = {}) {
        const { initialValues, onSubmit } = options;

        if (initialValues !== void 0) {
            this.values = initialValues;
        }

        this.submitHandler = onSubmit;
    }

    destroy = (): void => {
        this.subscriptions.forEach((subscription: Subscription) => {
            if (subscription && !subscription.closed) {
                subscription.unsubscribe();
            }
        });

        this.subscriptions = [];
    };

    getFieldValue<Value>(name: string): Value {
        return get(this.values, name);
    }

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
        const subscription = fieldInstance.value$.subscribe(
            (value: Value | undefined) => this.setFieldValue(fieldInstance.name, value)
        );

        this.subscriptions.push(subscription);
        this.fieldNames.push(fieldInstance.name);
    }

    setFieldValue<Value>(name: string, value: Value) {
        this.values = set(this.values, name, value);
    }

    submitForm = (): Promise<void> | void => {
        if (!this.submitHandler) {
            console.warn('Formeer instance wasn\'t provided with a \'onSubmit\' callback');
            return;
        }

        this.setIsSubmitting$.next(true);

        let probablyAwaitable = this.submitHandler(this.values);

        if (probablyAwaitable instanceof Promise) {
            probablyAwaitable.then(() => this.setIsSubmitting$.next(false));
        } else {
            this.setIsSubmitting$.next(false);
        }

        return probablyAwaitable;
    };

}
