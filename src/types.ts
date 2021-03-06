import { SyntheticEvent } from 'react';

export type TValidationError = string | undefined;
export type TValidator<Value = any, Values = any> = (value: Value, values: Values) => TValidationError;
export type TOnBlurHandler = () => void;
export type TOnChangeHandler<Value> = (event: SyntheticEvent<{ value: Value }>) => void;

export type TFormeerFieldMeta<Value> = {
    error: TValidationError;
    isDisabled: boolean;
    isTouched: boolean;
    value: Value | undefined;
};

export type TFormeerFieldOptions<Value> = {
    initialValue?: Value;
    validator?: TValidator;
};

export type TFormeerOptions<Values> = {
    initializeValues?: boolean;
    initialValues?: Values;
    onSubmit?: (values: Values) => Promise<void> | void;
};
