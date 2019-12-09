import get from 'lodash/get';
import set from 'lodash/set';
import React, { createContext, ReactNode, SyntheticEvent, useCallback, useState } from 'react';
import { BehaviorSubject, combineLatest, Observable, Subscription } from 'rxjs';
import { debounceTime, map } from 'rxjs/operators';
import guid from 'uuid/v4';

export type TValidationError = string | undefined;

export type TValidator<Value = any> = (value: Value) => TValidationError;

export type TOnBlurHandler = () => void;
export type TOnChangeHandler<Value> = (event: SyntheticEvent<{ value: Value }>) => void;

export type TFormeerFieldMeta<Value> = {
    error: TValidationError;
    touched: boolean;
    value: Value | undefined;
};

export type TFormeerFieldOptions<Value> = {
    initialValue?: Value;
    validator?: TValidator;
};

export class FormeerField<Value = any> {

    private static instances: Record<string, FormeerField> = {};

    static getInstance<Value>(formeerInstance: Formeer, fieldName: string, options?: TFormeerFieldOptions<Value>): FormeerField<Value> {
        if (!FormeerField.instances[name]) {
            FormeerField.instances[name] = new FormeerField<Value>(formeerInstance, fieldName, options);
        }

        return FormeerField.instances[name];
    }

    private onBlurHandler!: TOnBlurHandler;
    private onChangeHandler!: TOnChangeHandler<Value>;

    private setError$: BehaviorSubject<TValidationError> = new BehaviorSubject<TValidationError>(void 0);
    private setTouched$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
    private setValue$: BehaviorSubject<Value | undefined> = new BehaviorSubject<Value | undefined>(void 0);

    private validator?: TValidator

    readonly name: string;

    readonly error$: Observable<TValidationError> = this.setError$.asObservable();
    readonly touched$: Observable<boolean> = this.setTouched$.asObservable();
    readonly value$: Observable<Value | undefined> = this.setValue$.asObservable();

    constructor(formeerInstance: Formeer, fieldName: string, options: TFormeerFieldOptions<Value> = {}) {
        const { initialValue, validator } = options;

        this.name = fieldName;

        if (initialValue !== void 0) {
            this.setValue$.next(initialValue);
        }

        this.validator = validator;

        formeerInstance.registerField(this);

        this.onBlurHandler = () => this.setTouched$.next(true);
        this.onChangeHandler = ({ currentTarget }: SyntheticEvent<{ value: Value }>) => this.handleChange(currentTarget.value);
    }

    handleChange = (value: Value): void => {
        this.setValue$.next(value);

        if (typeof this.validator === 'function') {
            const newError = this.validator(value);
            this.setError$.next(newError);
        }
    }

    meta$ = (debounceDelay: number = 150): Observable<TFormeerFieldMeta<Value>> => {
        return combineLatest([this.error$, this.touched$, this.value$])
            .pipe(
                debounceTime(debounceDelay),
                map(([error, touched, value]: [TValidationError, boolean, Value | undefined]): TFormeerFieldMeta<Value> => ({ error, touched, value }))
            );
    }

    setIsTouched =(value: boolean): void => {
        this.setTouched$.next(value);
    }

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
            Formeer.instances[name] = new Formeer<Values>(initialValues);
        }

        return Formeer.instances[name];
    }

    private subscriptions: Array<Subscription> = [];
    private values: Values = {} as Values;

    constructor(initialValues?: Values) {
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
    }

    getFieldValue = get.bind(null, this.values);

    getValues = (): Values => {
        return this.values;
    }

    registerField<Value = any>(fieldInstance: FormeerField<Value>): void {
        const subscriptions = [
            fieldInstance.value$.subscribe((value: Value | undefined) => this.setFieldValue(fieldInstance.name, value))
        ];

        this.subscriptions = this.subscriptions.concat(subscriptions);
    }

    setFieldValue = set.bind(null, this.values);

}

export function useFormeer<Values = any>(name: string, initialValues?: Values): Formeer {
    const [instance] = useState(Formeer.getInstance(name, initialValues));

    return instance;
}

export function useFormeerField<Value = any>(formeerInstance: Formeer, fieldName: string, options?: TFormeerFieldOptions<Value>): FormeerField<Value> {
    const [fieldInstance] = useState(FormeerField.getInstance<Value>(formeerInstance, fieldName, options));

    return fieldInstance;
}

export const FormeerContext = createContext<Formeer | null>(null);
export const FormeerFieldContext = createContext<FormeerField | null>(null);

export type TFormeerHostProps<Values> = {
    children?: ReactNode;
    initialValues: Values;
    name?: string;
};

export function FormeerHost<Values = any>(props: TFormeerHostProps<Values>): JSX.Element {
    const { children, initialValues, name = guid() } = props;
    const formeerInstance = useFormeer(name, initialValues);

    return (
        <FormeerContext.Provider value={formeerInstance}>
            {children}
        </FormeerContext.Provider>
    );
}

export type TFormeerFieldHostProps<Value> = {
    children?: ReactNode;
    initialValue?: Value;
    name: string;
    validator?: TValidator<Value>;
};

export function FormeerFieldHost<Value = any>(props: TFormeerFieldHostProps<Value>): JSX.Element {
    const { children, name, initialValue, validator } = props;

    const renderFormeerFieldHost = useCallback((value: Formeer | null) => (
        <FormeerFieldContext.Provider value={value !== null ? useFormeerField(value, name, { initialValue, validator }) : null}> // TODO: prevent options object from recreation when not needed
            {children}
        </FormeerFieldContext.Provider>
    ), [children, name]);

    return (
        <FormeerContext.Consumer>
            {renderFormeerFieldHost}
        </FormeerContext.Consumer>
    );
}
