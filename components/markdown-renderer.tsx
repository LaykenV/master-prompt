"use client"
import React, { useEffect, useState } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Components } from "react-markdown"

import { cn } from "@/lib/utils"
import { CopyButton } from "@/components/copy-button"

interface MarkdownRendererProps {
  children: string
}

export function MarkdownRenderer({ children }: MarkdownRendererProps) {
  return (
    <div className="space-y-3">
      <Markdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children}
      </Markdown>
    </div>
  )
}

interface HighlightedPre extends React.HTMLAttributes<HTMLPreElement> {
  children: string
  language: string
}

const HighlightedPre = React.memo(({ children, language, ...props }: HighlightedPre) => {
  type ShikiToken = { content: string; htmlStyle?: string | Record<string, string> }
  const [tokens, setTokens] = useState<Array<Array<ShikiToken>> | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { codeToTokens, bundledLanguages } = await import("shiki")
        if (!(language in bundledLanguages)) {
          if (mounted) setTokens(null)
          return
        }
        const result = await codeToTokens(children, {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          lang: language as any,
          defaultColor: false,
          themes: {
            light: "github-light",
            dark: "github-dark",
          },
        })
        if (mounted) setTokens(result.tokens as Array<Array<ShikiToken>>)
      } catch {
        if (mounted) setTokens(null)
      }
    })()
    return () => {
      mounted = false
    }
  }, [children, language])

  if (!tokens) {
    return <pre {...props}>{children}</pre>
  }

  return (
    <pre {...props}>
      <code>
        {tokens.map((line, lineIndex) => (
          <span key={lineIndex}>
            {line.map((token, tokenIndex) => {
              const style = typeof token.htmlStyle === "string" ? undefined : (token.htmlStyle as React.CSSProperties)
              return (
                <span
                  key={tokenIndex}
                  className="text-shiki-light bg-shiki-light-bg dark:text-shiki-dark dark:bg-shiki-dark-bg"
                  style={style}
                >
                  {token.content}
                </span>
              )
            })}
            {lineIndex !== tokens.length - 1 && "\n"}
          </span>
        ))}
      </code>
    </pre>
  )
})
HighlightedPre.displayName = "HighlightedCode"

interface CodeBlockProps extends React.HTMLAttributes<HTMLPreElement> {
  children: React.ReactNode
  className?: string
  language: string
}

const CodeBlock = ({
  children,
  className,
  language,
  ...restProps
}: CodeBlockProps) => {
  const code =
    typeof children === "string"
      ? children
      : childrenTakeAllStringContents(children)

  const preClass = cn(
    "relative overflow-x-scroll rounded-md border bg-background/50 p-4 pr-14 font-mono text-sm [scrollbar-width:none]",
    className
  )

  return (
    <div className="group/code relative mb-4">
      <HighlightedPre language={language} className={preClass} {...restProps}>
        {code}
      </HighlightedPre>

      <div className="absolute right-2 top-2 z-20 flex space-x-1 rounded-md border border-foreground/20 bg-background/90 p-1 shadow-sm transition-all duration-200 visible opacity-100 md:invisible md:opacity-0 md:group-hover/code:visible md:group-hover/code:opacity-100">
        <CopyButton content={code} />
      </div>
    </div>
  )
}

function childrenTakeAllStringContents(element: React.ReactNode): string {
  if (typeof element === "string") {
    return element
  }

  if (React.isValidElement(element)) {
    const children = (element.props as { children?: React.ReactNode }).children

    if (children) {
      if (Array.isArray(children)) {
        return children
          .map((child) => childrenTakeAllStringContents(child))
          .join("")
      } else {
        return childrenTakeAllStringContents(children)
      }
    }
  }

  return ""
}

const COMPONENTS: Components = {
  h1: withClass("h1", "text-2xl font-semibold"),
  h2: withClass("h2", "font-semibold text-xl"),
  h3: withClass("h3", "font-semibold text-lg"),
  h4: withClass("h4", "font-semibold text-base"),
  h5: withClass("h5", "font-medium"),
  strong: withClass("strong", "font-semibold"),
  a: withClass("a", "text-primary underline underline-offset-2"),
  blockquote: withClass("blockquote", "border-l-2 border-primary pl-4"),
  code: ({ children, className, ...rest }) => {
    const match = /language-(\w+)/.exec(className || "")
    return match ? (
      <CodeBlock className={className} language={match[1]} {...rest}>
        {children}
      </CodeBlock>
    ) : (
      <code
        className={cn(
          "font-mono [:not(pre)>&]:rounded-md [:not(pre)>&]:bg-background/50 [:not(pre)>&]:px-1 [:not(pre)>&]:py-0.5"
        )}
        {...rest}
      >
        {children}
      </code>
    )
  },
  pre: ({ children }) => children,
  ol: withClass("ol", "list-decimal space-y-2 pl-6"),
  ul: withClass("ul", "list-disc space-y-2 pl-6"),
  li: withClass("li", "my-1.5"),
  table: withClass(
    "table",
    "w-full border-collapse overflow-y-auto rounded-md border border-foreground/20"
  ),
  th: withClass(
    "th",
    "border border-foreground/20 px-4 py-2 text-left font-bold [&[align=center]]:text-center [&[align=right]]:text-right"
  ),
  td: withClass(
    "td",
    "border border-foreground/20 px-4 py-2 text-left [&[align=center]]:text-center [&[align=right]]:text-right"
  ),
  tr: withClass("tr", "m-0 border-t p-0 even:bg-muted"),
  p: withClass("p", "whitespace-pre-wrap"),
  hr: withClass("hr", "border-foreground/20"),
}

function withClass<T extends keyof React.JSX.IntrinsicElements>(
  Tag: T,
  classes: string
) {
  const Component = ({ ...props }: React.ComponentProps<T>) =>
    React.createElement(Tag, { className: classes, ...props })
  Component.displayName = Tag as string
  return Component
}

export default MarkdownRenderer