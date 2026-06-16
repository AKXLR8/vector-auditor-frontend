import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypePrism from "rehype-prism-plus";

const components: any = {
  h1: ({ children, ...props }: any) => (
    <h1 {...props} className="text-xl font-bold mt-4 mb-2 text-[#F2F2F2]">{children}</h1>
  ),
  h2: ({ children, ...props }: any) => (
    <h2 {...props} className="text-lg font-semibold mt-3 mb-2 text-[#F2F2F2]">{children}</h2>
  ),
  h3: ({ children, ...props }: any) => (
    <h3 {...props} className="text-base font-semibold mt-2 mb-1 text-[#F2F2F2]">{children}</h3>
  ),
  p: ({ children, ...props }: any) => (
    <p {...props} className="mb-3 leading-relaxed">{children}</p>
  ),
  ul: ({ children, ...props }: any) => (
    <ul {...props} className="list-disc pl-5 mb-3 space-y-1">{children}</ul>
  ),
  ol: ({ children, ...props }: any) => (
    <ol {...props} className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>
  ),
  li: ({ children, ...props }: any) => (
    <li {...props} className="text-sm">{children}</li>
  ),
  code: ({ children, className, ...props }: any) =>
    className ? (
      <code {...props} className={className + " text-xs leading-relaxed font-mono block"}>{children}</code>
    ) : (
      <code {...props} className="bg-[#0D1C1A] px-1.5 py-0.5 rounded text-xs font-mono text-[#3B82F6]">{children}</code>
    ),
  pre: ({ children, ...props }: any) => (
    <pre {...props} className="bg-[#0d0d12] border border-[#1a1a2e] rounded-xl p-4 overflow-x-auto mb-3 text-xs font-mono [&>code]:!bg-transparent [&>code]:!p-0 [&>code]:!border-none">{children}</pre>
  ),
  blockquote: ({ children, ...props }: any) => (
    <blockquote {...props} className="border-l-2 border-[#102321] pl-3 italic text-[#9DAFAC] mb-3">{children}</blockquote>
  ),
  a: ({ href, children, ...props }: any) => (
    <a href={href} {...props} target="_blank" rel="noopener noreferrer" className="text-[#3B82F6] hover:underline">{children}</a>
  ),
  table: ({ children, ...props }: any) => (
    <div className="overflow-x-auto mb-3">
      <table {...props} className="w-full text-sm border-collapse border border-[#102321]">{children}</table>
    </div>
  ),
  th: ({ children, ...props }: any) => (
    <th {...props} className="border border-[#102321] px-3 py-2 bg-[#0D1C1A] text-left font-semibold">{children}</th>
  ),
  td: ({ children, ...props }: any) => (
    <td {...props} className="border border-[#102321] px-3 py-2">{children}</td>
  ),
  hr: (props: any) => <hr {...props} className="border-[#102321] my-4" />,
  sup: ({ children, ...props }: any) => <sup {...props}>{children}</sup>,
};

interface Props {
  children: string;
  className?: string;
}

export default function MarkdownRenderer({ children, className = "" }: Props) {
  return (
    <div className={className}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypePrism, rehypeRaw]}
        components={components}
      >
        {children}
      </Markdown>
    </div>
  );
}
