import get from 'lodash/get';
import set from 'lodash/set';
import React, { useState, createContext, ReactNode, useCallback } from 'react';
import guid from 'uuid/v4';

export type TValidationError = string | undefined;

export type TValidator<Value = any> = (value: Value) => TValidationError;

export type TFormeerFieldOptions<Value> = {
    initialValue?: Value;
    isTouched?: boolean;
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

    private _errors: Array<TValidationError> = [];
    private _isTouched: boolean = false;
    private validator?: TValidator;

    constructor(private formeerInstance: Formeer, private fieldName: string, options: TFormeerFieldOptions<Value> = {}) {
        const { initialValue, isTouched, validator } = options;

        if (initialValue !== void 0) {
            this.formeerInstance.setValue(fieldName, initialValue);
        }

        this._isTouched = !!isTouched;
        this.validator = validator;
    }

    handleChange(value: Value): void {
        this.formeerInstance.setValue(this.fieldName, value);

        if (typeof this.validator === 'function') {
            this.validator(value);
        }
    }

    handleTouch(): void {
        this._isTouched = true;
    }

    get errors(): Array<TValidationError> {
        return this._errors;
    }

    get isTouched(): boolean {
        return this._isTouched
    }

    get value(): Value {
        return this.formeerInstance.getValue<Value>(this.fieldName);
    }

}

export class Formeer<Values extends Record<string, any> = any> {

    private static instances: Record<string, Formeer> = {};

    static getInstance<Values>(name: string, initialValues: Values): Formeer<Values> {
        if (!Formeer.instances[name]) {
            Formeer.instances[name] = new Formeer<Values>(initialValues);
        }

        return Formeer.instances[name];
    }

    private values: Values;

    constructor(initialValues: Values) {
        this.values = initialValues;
    }

    getValue<Value = any>(fieldName: string): Value {
        return get(this.values, fieldName);
    }

    setValue<Value = any>(fieldName: string, value: Value): void {
        return void set(this.values, fieldName, value);
    }

    useField<Value = any>(fieldName: string, options?: TFormeerFieldOptions<Value>): FormeerField<Value> {
        const [fieldInstance] = useState(FormeerField.getInstance<Value>(this, fieldName, options));

        return fieldInstance;
    }

}

export function useFormeer<Values = any>(name: string, initialValues: Values): Formeer {
    const [instance] = useState(Formeer.getInstance(name, initialValues));

    return instance;
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
    fieldName: string;
    validator?: TValidator<Value>;
};

export function FormeerFieldHost<Value = any>(props: TFormeerFieldHostProps<Value>): JSX.Element {
    const { children, fieldName, initialValue, validator } = props;

    const renderFormeerFieldHost = useCallback((value: Formeer | null) => (
        <FormeerFieldContext.Provider value={value !== null ? value.useField(fieldName, { initialValue, validator }) : null}> // TODO: prevent options object from recreation when not needed
            {children}
        </FormeerFieldContext.Provider>
    ), [children, fieldName]);

    return (
        <FormeerContext.Consumer>
            {renderFormeerFieldHost}
        </FormeerContext.Consumer>
    );
}
