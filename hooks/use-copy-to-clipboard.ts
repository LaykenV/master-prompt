import { useCallback, useState, useRef } from "react";

export function useCopyToClipboard({ text }: { text: string }) {
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    timeoutRef.current = setTimeout(() => {
      setIsCopied(false);
    }, 2000);
  }, [text]);

  return { isCopied, handleCopy };
}