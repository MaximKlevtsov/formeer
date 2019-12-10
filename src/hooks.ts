import { useState } from 'react';
import { Formeer, FormeerField } from './instances';
import { TFormeerFieldOptions } from './types';

export function useFormeer<Values = any>(name: string, initialValues?: Values): Formeer {
    const [instance] = useState(Formeer.getInstance(name, initialValues));

    return instance;
}

export function useFormeerField<Value = any>(formeerInstance: Formeer, fieldName: string, options?: TFormeerFieldOptions<Value>): FormeerField<Value> {
    const [fieldInstance] = useState(FormeerField.getInstance<Value>(formeerInstance, fieldName, options));

    return fieldInstance;
}
