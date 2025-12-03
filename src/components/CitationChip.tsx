import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { FileText, Image } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CitationChipProps {
  label: string;
  manualId: string;
  page: number;
  bbox?: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
  manualTitle?: string;
  snippet?: string;
  figureUrl?: string;
  isFigure?: boolean;
}

export const CitationChip = ({
  label,
  manualId,
  page,
  bbox,
  manualTitle,
  snippet,
  figureUrl,
  isFigure,
}: CitationChipProps) => {
  const navigate = useNavigate();

  const handleClick = () => {
    let url = `/manual/${manualId}?page=${page}`;
    if (bbox) {
      url += `&x1=${bbox.x1}&y1=${bbox.y1}&x2=${bbox.x2}&y2=${bbox.y2}`;
    }
    navigate(url);
  };

  const displayLabel = label.replace(/^c/, '');
  const tooltipText = manualTitle 
    ? `${manualTitle} - Page ${page}${snippet ? `\n"${snippet}..."` : ''}`
    : `Page ${page}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="secondary"
          className="cursor-pointer hover:bg-primary/20 hover:text-primary transition-colors inline-flex items-center gap-1 text-xs mx-0.5 align-middle"
          onClick={handleClick}
        >
          {isFigure ? (
            <Image className="h-3 w-3" />
          ) : (
            <FileText className="h-3 w-3" />
          )}
          <span className="font-medium">{displayLabel}</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <p className="text-xs whitespace-pre-line">{tooltipText}</p>
      </TooltipContent>
    </Tooltip>
  );
};
