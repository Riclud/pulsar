import type { UiChild, UiNode } from "./ui.ts"

type JsxComponent = (props: never, ...children: never[]) => UiChild

type JsxProps = Record<string, unknown> & { children?: unknown }

const childList = (children: unknown): UiChild[] => {
  if (children === undefined) return []

  return (Array.isArray(children) ? children : [children]) as UiChild[]
}

/** Calls the component as a plain function: `(props, ...children)`. */
export const jsx = (type: JsxComponent | string, props: JsxProps, key?: string | number): UiNode => {
  if (typeof type !== "function") {
    throw new Error(`pulsar has no <${String(type)}> element; use a component such as <Box> or <Text>`)
  }

  const { children, ...rest } = props
  const own = key === undefined ? rest : { ...rest, key }
  const component = type as unknown as (props: unknown, ...children: UiChild[]) => UiNode

  return component(own, ...childList(children))
}

export const jsxs = jsx

export const jsxDEV = (type: JsxComponent | string, props: JsxProps, key?: string | number): UiNode => {
  return jsx(type, props, key)
}

/** Groups children without adding a node. */
export const Fragment = (_props: unknown, ...children: UiChild[]): UiNode => {
  return children as unknown as UiNode
}

export namespace JSX {
  export type Element = UiNode
  export type ElementType = JsxComponent

  export interface ElementChildrenAttribute {
    children: unknown
  }

  export interface IntrinsicAttributes {
    key?: string | number
  }

  export type LibraryManagedAttributes<_Component, Props> = Props & {
    children?: UiChild | (() => UiNode)
  }

  export interface IntrinsicElements {}
}
