import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";

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
  figurePath?: string;
  snippet?: string;
}

export const CitationChip = ({
  label,
  manualId,
  page,
  bbox,
  snippet,
}: CitationChipProps) => {
  const navigate = useNavigate();

  const handleClick = () => {
    let url = `/manual/${manualId}?page=${page}`;
    if (bbox) {
      url += `&x1=${bbox.x1}&y1=${bbox.y1}&x2=${bbox.x2}&y2=${bbox.y2}`;
    }
    navigate(url);
  };

  return (
    <Badge
      variant="secondary"
      className="cursor-pointer hover:bg-accent transition-colors inline-flex items-center gap-1 text-xs"
      onClick={handleClick}
      title={snippet}
    >
      <FileText className="h-3 w-3" />
      {label}
    </Badge>
  );
};
