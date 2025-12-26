"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";

interface HeadingProps extends useRender.ComponentProps<"h1"> {}

export function Heading(props: HeadingProps) {
  const { render, children, ...otherProps } = props;

  const element = useRender({
    defaultTagName: "h1",
    render,
    props: mergeProps(
      {
        className:
          "text-text-high font-semibold tracking-tight font-mono leading-[140%]",
        children: (
          <>
            {props.id ? (
              <a href={`#${props.id}`} className="no-underline hover:underline">
                {props.children}
              </a>
            ) : (
              props.children
            )}
          </>
        ),
      },
      otherProps,
    ),
  });

  return element;
}
