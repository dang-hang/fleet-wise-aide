import { cn } from "@/lib/utils";
import { CitationChip } from "./CitationChip";

interface Citation {
  label: string;
  manualId: string;
  page: number;
  bbox?: { x1: number; y1: number; x2: number; y2: number };
  snippet?: string;
  manualTitle?: string;
  figureUrl?: string;
  isFigure?: boolean;
}

interface MarkdownRendererProps {
  content: string;
  className?: string;
  citations?: Record<string, Citation>;
}

export const MarkdownRenderer = ({ content, className, citations }: MarkdownRendererProps) => {
  const renderContent = (text: string) => {
    const lines = text.split('\n');
    const elements: JSX.Element[] = [];
    let currentParagraph: string[] = [];
    let listItems: string[] = [];
    let isInList = false;

    const flushParagraph = () => {
      if (currentParagraph.length > 0) {
        const paragraphText = currentParagraph.join(' ');
        elements.push(
          <p key={`p-${elements.length}`} className="mb-3 leading-relaxed">
            {parseInlineFormatting(paragraphText)}
          </p>
        );
        currentParagraph = [];
      }
    };

    const flushList = () => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`ul-${elements.length}`} className="mb-4 ml-4 space-y-2">
            {listItems.map((item, idx) => (
              <li key={idx} className="flex gap-2">
                <span className="text-primary mt-1">•</span>
                <span className="flex-1">{parseInlineFormatting(item)}</span>
              </li>
            ))}
          </ul>
        );
        listItems = [];
        isInList = false;
      }
    };

    lines.forEach((line, index) => {
      // Headers
      if (line.startsWith('###')) {
        flushParagraph();
        flushList();
        elements.push(
          <h3 key={`h3-${index}`} className="text-lg font-semibold mb-3 mt-4 text-foreground">
            {parseInlineFormatting(line.replace(/^###\s*/, ''))}
          </h3>
        );
      } else if (line.startsWith('##')) {
        flushParagraph();
        flushList();
        elements.push(
          <h2 key={`h2-${index}`} className="text-xl font-bold mb-4 mt-5 text-foreground">
            {parseInlineFormatting(line.replace(/^##\s*/, ''))}
          </h2>
        );
      } else if (line.startsWith('#')) {
        flushParagraph();
        flushList();
        elements.push(
          <h1 key={`h1-${index}`} className="text-2xl font-bold mb-4 mt-6 text-foreground">
            {parseInlineFormatting(line.replace(/^#\s*/, ''))}
          </h1>
        );
      }
      // List items
      else if (line.match(/^[-*]\s+/)) {
        flushParagraph();
        isInList = true;
        listItems.push(line.replace(/^[-*]\s+/, ''));
      }
      // Numbered lists
      else if (line.match(/^\d+\.\s+/)) {
        flushParagraph();
        if (!isInList) {
          flushList();
        }
        isInList = true;
        listItems.push(line.replace(/^\d+\.\s+/, ''));
      }
      // Empty line - paragraph break
      else if (line.trim() === '') {
        flushParagraph();
        flushList();
      }
      // Regular text
      else if (line.trim()) {
        if (isInList) {
          flushList();
        }
        currentParagraph.push(line);
      }
    });

    // Flush any remaining content
    flushParagraph();
    flushList();

    return elements;
  };

  const parseInlineFormatting = (text: string): (string | JSX.Element)[] => {
    const parts: (string | JSX.Element)[] = [];
    let remaining = text;
    let key = 0;

    while (remaining) {
      // Citation markers {{c#}} or figure markers {{fig#_#}}
      const citationMatch = remaining.match(/\{\{(c\d+|fig\d+_\d+)\}\}/);
      if (citationMatch && citations) {
        const beforeCitation = remaining.substring(0, citationMatch.index);
        if (beforeCitation) parts.push(beforeCitation);
        
        const citationKey = citationMatch[1];
        const citation = citations[citationKey];
        
        if (citation) {
          // If it's a figure with a URL, render it inline
          if (citation.isFigure && citation.figureUrl) {
            parts.push(
              <div key={`figure-${key++}`} className="my-4 rounded-lg overflow-hidden border border-border">
                <img 
                  src={citation.figureUrl} 
                  alt={citation.snippet || `Figure from ${citation.manualTitle}`}
                  className="w-full max-w-md mx-auto"
                  loading="lazy"
                />
                <div className="px-3 py-2 bg-muted/50 text-xs text-muted-foreground flex items-center justify-between">
                  <span>{citation.snippet || `Diagram from page ${citation.page}`}</span>
                  <CitationChip
                    label={citationKey}
                    manualId={citation.manualId}
                    page={citation.page}
                    bbox={citation.bbox}
                    manualTitle={citation.manualTitle}
                    snippet={citation.snippet}
                    figureUrl={citation.figureUrl}
                    isFigure={citation.isFigure}
                  />
                </div>
              </div>
            );
          } else {
            parts.push(
              <CitationChip
                key={`citation-${key++}`}
                label={citationKey}
                manualId={citation.manualId}
                page={citation.page}
                bbox={citation.bbox}
                manualTitle={citation.manualTitle}
                snippet={citation.snippet}
                figureUrl={citation.figureUrl}
                isFigure={citation.isFigure}
              />
            );
          }
        } else {
          parts.push(citationMatch[0]);
        }
        
        remaining = remaining.substring((citationMatch.index || 0) + citationMatch[0].length);
        continue;
      }

      // Bold text (**text**)
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      if (boldMatch) {
        const beforeBold = remaining.substring(0, boldMatch.index);
        if (beforeBold) parts.push(beforeBold);
        parts.push(
          <strong key={`bold-${key++}`} className="font-semibold text-foreground">
            {boldMatch[1]}
          </strong>
        );
        remaining = remaining.substring((boldMatch.index || 0) + boldMatch[0].length);
        continue;
      }

      // Inline code (`code`)
      const codeMatch = remaining.match(/`(.+?)`/);
      if (codeMatch) {
        const beforeCode = remaining.substring(0, codeMatch.index);
        if (beforeCode) parts.push(beforeCode);
        parts.push(
          <code key={`code-${key++}`} className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">
            {codeMatch[1]}
          </code>
        );
        remaining = remaining.substring((codeMatch.index || 0) + codeMatch[0].length);
        continue;
      }

      // No more matches
      parts.push(remaining);
      break;
    }

    return parts;
  };

  return (
    <div className={cn("text-sm text-muted-foreground", className)}>
      {renderContent(content)}
    </div>
  );
};
