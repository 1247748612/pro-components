﻿import React, { useMemo, useContext, useCallback, useState, useRef, useEffect } from 'react';
import {
  pickProFormItemProps,
  omitUndefined,
  usePrevious,
  isDeepEqualReact,
  useRefFunction,
} from '@ant-design/pro-utils';
import classnames from 'classnames';
import { noteOnce } from 'rc-util/lib/warning';
import { stringify } from 'use-json-comparison';
import FieldContext from '../FieldContext';
import type { ExtendsProps, ProFormFieldItemProps, ProFormItemCreateConfig } from '../interface';
import ProFormItem from '../components/FormItem';
import { FieldContext as RcFieldContext } from 'rc-field-form';
import { ProFormDependency } from '..';
import type { NamePath } from 'rc-field-form/es/interface';

export const TYPE = Symbol('ProFormComponent');

const WIDTH_SIZE_ENUM = {
  // 适用于短数字，短文本或者选项
  xs: 104,
  s: 216,
  // 适用于较短字段录入、如姓名、电话、ID 等。
  sm: 216,
  m: 328,
  // 标准宽度，适用于大部分字段长度。
  md: 328,
  l: 440,
  // 适用于较长字段录入，如长网址、标签组、文件路径等。
  lg: 440,
  // 适用于长文本录入，如长链接、描述、备注等，通常搭配自适应多行输入框或定高文本域使用。
  xl: 552,
};

type ProFormComponent<P, Extends> = React.ComponentType<P & Extends>;

/** 处理fieldProps和formItemProps为function时传进来的方法, 目前只在SchemaForm时可能会有 */
type FunctionFieldProps = {
  getFormItemProps?: () => Record<string, any>;
  getFieldProps?: () => Record<string, any>;
};

/**
 * 这个方法的主要作用的帮助 Field 增加 FormItem 同时也会处理 lightFilter
 *
 * @param Field
 * @param config
 */
function createField<P extends ProFormFieldItemProps = any>(
  Field: React.ComponentType<P> | React.ForwardRefExoticComponent<P>,
  config?: ProFormItemCreateConfig,
): ProFormComponent<P, ExtendsProps & FunctionFieldProps> {
  // 标记是否是 ProForm 的组件
  // @ts-ignore
  // eslint-disable-next-line no-param-reassign
  Field.displayName = 'ProFormComponent';

  const FieldWithContext: React.FC<P & ExtendsProps & FunctionFieldProps> = (props) => {
    const {
      valueType,
      customLightMode,
      lightFilterLabelFormatter,
      valuePropName = 'value',
      ignoreWidth,
      defaultProps,
      ...defaultFormItemProps
    } = { ...props?.filedConfig, ...config } || {};

    const {
      label,
      tooltip,
      placeholder,
      width,
      bordered,
      messageVariables,
      ignoreFormItem,
      transform,
      readonly,
      allowClear,
      colSize,
      getFormItemProps,
      getFieldProps,
      filedConfig,
      cacheForSwr,
      proFieldProps,
      ...rest
    } = { ...defaultProps, ...props };

    const propsRenderFormItem = useRefFunction(rest.renderFormItem);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_, forceUpdate] = useState<[]>();

    // onChange触发fieldProps,formItemProps重新执行
    const [onlyChange, forceUpdateByOnChange] = useState<[]>();

    const shouldRender = useRef<boolean>(true);
    /** 从 context 中拿到的值 */
    const fieldContextValue = React.useContext(FieldContext);

    const fieldProps = useMemo(
      () => ({
        ...fieldContextValue.fieldProps,
        // 支持未传递getFieldProps的情况
        ...(rest.fieldProps as any),
        ...getFieldProps?.(),
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [fieldContextValue.fieldProps, getFieldProps, onlyChange, rest.dependenciesValues], // random for onChange or dependencies
    );

    const formItemProps = useMemo(
      () => ({
        ...fieldContextValue.formItemProps,
        ...(rest.formItemProps as any),
        // 支持未传递getFormItemProps的情况
        ...getFormItemProps?.(),
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [fieldContextValue.formItemProps, getFormItemProps, onlyChange, rest.dependenciesValues], // random for onChange or dependencies
    );

    // 支持测试用例 renderFormItem support return false
    useEffect(() => {
      if (
        shouldRender.current === false &&
        // 借助 dependenciesValues 重新执行renderFormItem
        (rest.renderFormItem || rest.dependenciesValues)
      ) {
        shouldRender.current = true;
        forceUpdate([]);
      }
    }, [rest.dependenciesValues, rest.renderFormItem]);

    // restFormItemProps is user props pass to Form.Item
    const restFormItemProps = pickProFormItemProps(rest);

    const formNeedProps = useMemo(() => {
      return omitUndefined({
        value: (rest as any).value,
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [(rest as any).value]);

    const realFormItem = useMemo(() => {
      if (!ignoreFormItem) {
        return {};
      }
      return omitUndefined(formNeedProps);
    }, [formNeedProps, ignoreFormItem]);

    const realFieldProps = useMemo(() => {
      return omitUndefined({
        ...realFormItem,
        disabled: props.disabled,
        placeholder,
        ...fieldProps,
        style: omitUndefined({
          // 有些组件是不需要自带的 width
          ...fieldProps?.style,
        }),
      }) as any;
    }, [fieldProps, placeholder, props.disabled, realFormItem]);

    const otherProps = useMemo(
      () => ({
        messageVariables,
        ...defaultFormItemProps,
        ...formItemProps,
        ...restFormItemProps,
      }),
      [defaultFormItemProps, formItemProps, messageVariables, restFormItemProps],
    );

    noteOnce(
      // eslint-disable-next-line @typescript-eslint/dot-notation
      !rest['defaultValue'],
      '请不要在 Form 中使用 defaultXXX。如果需要默认值请使用 initialValues 和 initialValue。',
    );

    const ignoreWidthValueType = useMemo(() => ['switch', 'radioButton', 'radio', 'rate'], []);

    const { prefixName } = useContext(RcFieldContext);
    const proFieldKey = useMemo(() => {
      /** 如果没有cacheForSwr，默认关掉缓存 只有table中默认打开，form中打开问题还挺多的，有些场景name 会相同 */
      if (!cacheForSwr) return undefined;
      let name = otherProps?.name;
      if (Array.isArray(name)) name = name.join('_');
      if (Array.isArray(prefixName) && name) name = `${prefixName.join('.')}.${name}`;
      return name && `form-field-${name}`;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stringify(otherProps?.name), prefixName]);

    const realFieldPropsStyle = useMemo(
      () => ({
        ...realFieldProps?.style,
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [stringify(realFieldProps?.style)],
    );

    if (realFieldPropsStyle.width !== undefined && (rest as any).valueType === 'switch') {
      delete realFieldPropsStyle.width;
    }

    const propsValueType = useMemo(() => (rest as any).valueType, [(rest as any).valueType]);
    const prefRest = usePrevious(rest);

    const onChange = useCallback(
      (...restParams) => {
        if (getFormItemProps || getFieldProps) {
          forceUpdateByOnChange([]);
        } else if (rest.renderFormItem) {
          forceUpdate([]);
        }
        realFieldProps?.onChange?.(...restParams);
      },
      [getFieldProps, getFormItemProps, realFieldProps, rest.renderFormItem],
    );

    const renderFormItem = useCallback(
      (...args: any) => {
        const renderDom = propsRenderFormItem(...args);

        // 支持renderFormItem返回false||null||undefined后渲染组件
        if (
          (renderDom === false || renderDom === null || renderDom === undefined) &&
          shouldRender.current === true
        ) {
          shouldRender.current = false;
          // 由于renderFormItem可能会触发setState的执行，所以需要延迟执行
          setTimeout(() => forceUpdate([]));
        }
        return renderDom;
      },
      [propsRenderFormItem],
    );

    const style = useMemo(() => {
      return omitUndefined({
        width: width && !WIDTH_SIZE_ENUM[width] ? width : undefined,
        ...realFieldPropsStyle,
      });
    }, [realFieldPropsStyle, width]);

    const className = useMemo(() => {
      return (
        classnames(realFieldProps?.className, {
          'pro-field': width && WIDTH_SIZE_ENUM[width],
          [`pro-field-${width}`]:
            width &&
            // 有些 valueType 不需要宽度
            !ignoreWidthValueType.includes(propsValueType as 'text') &&
            !ignoreWidth &&
            WIDTH_SIZE_ENUM[width],
        }) || undefined
      );
    }, [ignoreWidth, ignoreWidthValueType, propsValueType, realFieldProps?.className, width]);

    const fieldProFieldProps = useMemo(() => {
      return omitUndefined({
        mode: rest?.mode,
        readonly,
        params: rest.params,
        proFieldKey: proFieldKey,
        ...proFieldProps,
      });
    }, [proFieldKey, readonly, rest?.mode, rest.params, proFieldProps]);

    const fieldFieldProps = useMemo(() => {
      return {
        onChange,
        allowClear,
        ...realFieldProps,
        style,
        className,
      };
    }, [allowClear, className, onChange, realFieldProps, style]);

    const field = useMemo(() => {
      return (
        <Field
          // ProXxx 上面的 props 透传给 FieldProps，可能包含 Field 自定义的 props，
          // 比如 ProFormSelect 的 request
          {...(rest as P)}
          renderFormItem={rest.renderFormItem ? renderFormItem : undefined}
          fieldProps={fieldFieldProps}
          proFieldProps={fieldProFieldProps}
        />
      );
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      renderFormItem,
      fieldProFieldProps,
      fieldFieldProps,
      // eslint-disable-next-line react-hooks/exhaustive-deps
      isDeepEqualReact(prefRest, rest, [
        'onChange',
        'onBlur',
        'onFocus',
        'record',
        'renderFormItem',
      ])
        ? undefined
        : {},
    ]);

    if (shouldRender.current === false) {
      return null;
    }

    return (
      <ProFormItem
        // 全局的提供一个 tip 功能，可以减少代码量
        // 轻量模式下不通过 FormItem 显示 label
        label={label && proFieldProps?.light !== true ? label : undefined}
        tooltip={proFieldProps?.light !== true && tooltip}
        valuePropName={valuePropName}
        key={otherProps.name?.toString()}
        {...otherProps}
        ignoreFormItem={ignoreFormItem}
        transform={transform}
        dataFormat={fieldProps?.format}
        valueType={valueType || (rest as any).valueType}
        messageVariables={{
          label: (label as string) || '',
          ...otherProps?.messageVariables,
        }}
        lightProps={omitUndefined({
          ...realFieldProps,
          valueType: valueType || (rest as any).valueType,
          bordered,
          allowClear: field?.props?.allowClear ?? allowClear,
          light: proFieldProps?.light,
          label,
          customLightMode,
          labelFormatter: lightFilterLabelFormatter,
          valuePropName,
          footerRender: field?.props?.footerRender,
          // 使用用户的配置覆盖默认的配置
          ...rest.lightProps,
          ...otherProps.lightProps,
        })}
      >
        {field}
      </ProFormItem>
    );
  };

  // 标记是否是 proform 的组件
  FieldWithContext.displayName = 'ProFormComponent';

  const Wrapper: React.FC<P & ExtendsProps & FunctionFieldProps> = (props) => {
    const { dependencies } = props;
    return dependencies ? (
      <ProFormDependency name={dependencies}>
        {(values) => {
          return (
            <FieldWithContext dependenciesValues={values} dependencies={dependencies} {...props} />
          );
        }}
      </ProFormDependency>
    ) : (
      <FieldWithContext dependencies={dependencies} {...props} />
    );
  };

  return Wrapper;
}

export default createField;
