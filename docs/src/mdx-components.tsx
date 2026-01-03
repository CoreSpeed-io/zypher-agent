/** biome-ignore-all lint/a11y/useHeadingContent: ignore */
import defaultMdxComponents from "fumadocs-ui/mdx";

import type { MDXComponents } from "mdx/types";
import { A } from "./modules/mdx-components/a";
import { Accordion, Accordions } from "./modules/mdx-components/accordion";
import { Callout } from "./modules/mdx-components/callout";
import { Card, Cards } from "./modules/mdx-components/cards";
import {
  CodeBlock,
  CodeBlockTab,
  CodeBlockTabs,
  CodeBlockTabsList,
  CodeBlockTabsTrigger,
  Pre,
} from "./modules/mdx-components/code-block";
import { Heading } from "./modules/mdx-components/heading";

// use this function to get MDX components, you will need it for rendering MDX
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,

    pre: ({ children, ...props }) => {
      return (
        <CodeBlock {...props}>
          <Pre>{children}</Pre>
        </CodeBlock>
      );
    },
    h1: (props) => {
      return (
        <Heading
          render={<h1 className="mb-8 scroll-m-8 text-3xl" />}
          {...props}
        />
      );
    },
    h2: (props) => {
      return (
        <Heading
          render={<h2 className="mb-8 scroll-m-8 text-[28px]" />}
          {...props}
        />
      );
    },
    h3: (props) => {
      return (
        <Heading
          render={<h3 className="mb-6 scroll-m-6 text-2xl" />}
          {...props}
        />
      );
    },
    h4: (props) => {
      return (
        <Heading
          render={<h4 className="mb-4 scroll-m-4 text-xl" />}
          {...props}
        />
      );
    },
    h5: (props) => {
      return (
        <Heading
          render={<h5 className="mb-2 scroll-m-2 text-base" />}
          {...props}
        />
      );
    },
    h6: (props) => {
      return (
        <Heading
          render={<h6 className="mb-1 scroll-m-1 text-sm" />}
          {...props}
        />
      );
    },
    p: (props) => {
      return <p className="text-text-base my-4 leading-[180%]" {...props} />;
    },
    ul: (props) => {
      return (
        <ul
          className="tablet:leading-[200%] desktop:leading-[250%] list-inside list-disc text-sm leading-[140%]"
          {...props}
        />
      );
    },
    ol: (props) => {
      return (
        <ol
          className="tablet:leading-[200%] desktop:leading-[250%] list-inside list-decimal text-sm leading-[140%]"
          {...props}
        />
      );
    },
    a: A,
    code: (props) => {
      // code block
      if (typeof props.children !== "string") {
        return <code {...props} />;
      }

      // inline code
      return (
        <code
          className="text-outline-high border-outline-low bg-bg-b2 rounded-sm px-1.5 py-0.5 text-xs font-medium!"
          {...props}
        />
      );
    },
    table: (props) => {
      return <table className="rounded-sm" {...props} />;
    },
    tbody: (props) => {
      return <tbody className="bg-bg-b0" {...props} />;
    },
    td: (props) => {
      return <td className="px-4 py-5.5 text-sm leading-[140%]" {...props} />;
    },
    th: (props) => {
      return (
        <th
          className="px-4 py-3 ps-4 font-mono text-sm leading-[140%] font-semibold"
          {...props}
        />
      );
    },
    img: (props) => {
      return (
        // biome-ignore lint/performance/noImgElement: ignore
        <img
          alt={props.alt}
          className="rounded-md shadow-[0px_2px_3px_-1px_rgba(0,0,0,0.1),0px_1px_0px_0px_rgba(25,28,33,0.02),0px_0px_0px_1px_rgba(25,28,33,0.08)]"
          {...props}
        />
      );
    },
    strong: (props) => {
      return <strong className="text-text-high font-semibold" {...props} />;
    },
    blockquote: (props) => {
      return (
        <blockquote
          className="not-italic [&_p]:before:content-none [&_p]:after:content-none"
          {...props}
        />
      );
    },
    CodeBlockTab,
    CodeBlockTabs,
    CodeBlockTabsList,
    CodeBlockTabsTrigger,
    Cards,
    Card,
    Accordions,
    Accordion,
    Callout,
    ...components,
  };
}
