import { Highlight, themes } from "prism-react-renderer";

export default function LazyCodeBlock({ lang, code }: { lang: string | undefined; code: string }) {
  return (
    <Highlight theme={themes.vsDark} code={code.replace(/\n$/, "")} language={lang ?? "text"}>
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre className={`chat-msg-codeblock ${className}`} style={style}>
          {lang && <span className="chat-msg-codeblock-lang">{lang}</span>}
          <code>
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, j) => (
                  <span key={j} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </code>
        </pre>
      )}
    </Highlight>
  );
}
