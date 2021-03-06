import get from 'lodash/get';
import set from 'lodash/set';
import { SyntheticEvent } from 'react';
import { combineLatest, BehaviorSubject, Observable, Subscription } from 'rxjs';
import { debounceTime, first, map, switchMap, take } from 'rxjs/operators';
import { TFormeerFieldMeta, TFormeerFieldOptions, TOnBlurHandler, TOnChangeHandler, TValidationError, TValidator, TFormeerOptions } from './types';

export class FormeerField<Value = any> {

    private static instances: Record<string, FormeerField> = {};

    static getInstance<Value>(formeerInstance: Formeer, name: string, options?: TFormeerFieldOptions<Value>): FormeerField<Value> {
        const key = `${formeerInstance.name}-${name}`;

        if (!FormeerField.instances[key]) {
            new FormeerField<Value>(formeerInstance, name, options);
        }

        return FormeerField.instances[key];
    }

    private onBlurHandler!: TOnBlurHandler;
    private onChangeHandler!: TOnChangeHandler<Value>;

    private setError$: BehaviorSubject<TValidationError> = new BehaviorSubject<TValidationError>(void 0);
    private setIsDisabled$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
    private setIsTouched$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
    private setValue$: BehaviorSubject<Value | undefined> = new BehaviorSubject<Value | undefined>(void 0);

    private validator?: TValidator

    readonly name: string;

    readonly isDisabled$: Observable<boolean> = this.setIsDisabled$.asObservable();
    readonly isTouched$: Observable<boolean> = this.setIsTouched$.asObservable();
    readonly value$: Observable<Value | undefined> = this.setValue$.asObservable();

    constructor(private formeerInstance: Formeer, fieldName: string, options: TFormeerFieldOptions<Value> = {}) {
        const { initialValue, validator } = options;

        const key = `${formeerInstance.name}-${fieldName}`;
        FormeerField.instances[key] = this;

        this.name = fieldName;

        if (initialValue !== void 0) {
            this.setValue$.next(initialValue);
        }

        this.validator = validator;

        this.formeerInstance.registerField(this);

        this.onBlurHandler = () => {
            this.setIsTouched$.next(true);
            this.runValidation();
        };
        this.onChangeHandler = ({ currentTarget }: SyntheticEvent<{ value: Value }>) => this.handleChange(currentTarget.value);

        this.runValidation();
    };

    error$(pure: boolean = true): Observable<TValidationError> {
        const error$ = combineLatest([this.setError$.asObservable(), this.isDisabled$]).pipe(
            debounceTime(150),
            map(([error, isDisabled]: [TValidationError, boolean]) => !isDisabled ? error : undefined)
        );

        if (pure) {
            return error$;
        }

        return combineLatest([error$, this.isTouched$]).pipe(
            debounceTime(150),
            map(([error, isTouched]: [TValidationError, boolean]) => isTouched ? error : undefined)
        );
    }

    handleChange = (value: Value): void => {
        this.setValue$.next(value);

        this.runValidation(value);
    };

    meta$ = (debounceDelay: number = 150): Observable<TFormeerFieldMeta<Value>> => {
        return combineLatest([this.error$(), this.isDisabled$, this.isTouched$, this.value$])
            .pipe(
                debounceTime(debounceDelay),
                map(([
                    error,
                    isDisabled,
                    isTouched,
                    value
                ]: [
                    TValidationError,
                    boolean,
                    boolean,
                    Value | undefined
                ]): TFormeerFieldMeta<Value> => ({ error, isDisabled, isTouched, value }))
            );
    };

    runValidation(value: Value | undefined = this.setValue$.value): void {
        if (this.setIsDisabled$.value) return;

        if (this.validator) {
            const newError = this.validator(value, this.formeerInstance.currentValues);
            this.setError$.next(newError);
        }
    }

    setError = (error: TValidationError): void => {
        this.setError$.next(error);
    };

    setIsDisabled = (isDisabled: boolean): void => {
        this.setIsDisabled$.next(isDisabled);
    };

    setIsTouched = (isTouched: boolean): void => {
        this.setIsTouched$.next(isTouched);
    };

    setValue = (value: Value | undefined): void => {
        this.setValue$.next(value);
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
            Formeer.instances[name] = new Formeer<Values>(name, initialValues);
        }

        return Formeer.instances[name];
    }

    private setFieldNames$: BehaviorSubject<Array<string>> = new BehaviorSubject([] as Array<string>);
    private setIsSubmitting$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
    private setValues$: BehaviorSubject<Values> = new BehaviorSubject<Values>({} as Values);

    private submitHandler?: TFormeerOptions<Values>['onSubmit'];
    private subscriptions: Array<Subscription> = [];

    readonly fieldNames$: Observable<Array<string>> = this.setFieldNames$.asObservable();
    readonly isSubmitting$: Observable<boolean> = this.setIsSubmitting$.asObservable();
    readonly values$: Observable<Values> = this.setValues$.asObservable();

    readonly initializeValues?: boolean;
    readonly name: string;

    constructor(name: string, options: TFormeerOptions<Values> = {}) {
        const { initializeValues, initialValues, onSubmit } = options;

        this.name = name;

        if (initialValues !== void 0) {
            this.setValues$.next(initialValues);
        }

        this.initializeValues = initializeValues;
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

    errors$ = (hideUntouched = false, filter?: Array<string>): Observable<Array<string>> => {
        return this.fieldNames$.pipe(
            map((fieldNames: Array<string>) => filter ? fieldNames.filter((name: string) => filter.includes(name)) : fieldNames),
            map((fieldNames: Array<string>) => fieldNames.map((name: string) => FormeerField.getInstance(this, name).error$(!hideUntouched))),
            switchMap((errorStreams: Array<Observable<TValidationError>>) => combineLatest(errorStreams)),
            map((errors: Array<TValidationError>) => errors.filter((error: TValidationError): error is string => !!error))
        );
    };

    registerField<Value = any>(fieldInstance: FormeerField<Value>): void {
        if (this.initializeValues) {
            fieldInstance.setValue(get(this.setValues$.value, fieldInstance.name, void 0));
        }

        const subscription = fieldInstance.value$.subscribe(
            (value: Value | undefined) => this.setFieldValue(fieldInstance.name, value)
        );

        this.subscriptions.push(subscription);
        this.setFieldNames$.next(this.setFieldNames$.value.concat(fieldInstance.name));
    }

    private setFieldValue<Value>(name: string, value: Value) {
        this.setValues$.next(set(this.setValues$.value, name, value));
    }

    setSubmitFormHandler = (submitHandler: TFormeerOptions<Values>['onSubmit']) => {
        this.submitHandler = submitHandler;
    };

    submitForm = async (): Promise<void> => {
        if (!this.submitHandler) {
            console.warn('Formeer instance wasn\'t provided with a \'onSubmit\' callback');
            return;
        }

        this.setIsSubmitting$.next(true);

        const values = await this.values$.pipe(first()).toPromise();

        let probablyAwaitable = this.submitHandler(values);

        if (probablyAwaitable instanceof Promise) {
            probablyAwaitable.then(() => this.setIsSubmitting$.next(false));
        } else {
            this.setIsSubmitting$.next(false);
        }

        return probablyAwaitable;
    };

    async triggerValidation(): Promise<void> {
        const fieldNames = await this.fieldNames$.pipe(take(1)).toPromise();
        fieldNames.forEach((name: string) => FormeerField.getInstance(this, name).runValidation());
    }

    get currentValues(): Values {
        return this.setValues$.value;
    }

}
