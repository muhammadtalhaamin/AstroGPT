"use client";
import React, { useState, useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Send,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  Menu,
  Copy,
  RotateCcw,
  Coins,
  Check,
  Upload,
  X,
  File,
  PencilIcon,
  RotateCw,
  Moon,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";
import QuickStartCards from "@/components/QuickStartCards";
import PricingCards from "@/components/PricingCards";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Highlight, themes } from "prism-react-renderer";
import { useTheme } from "next-themes";
import ThemeToggleHeader from "@/components/ThemeToggleHeader";

interface MessageFeedback {
  liked: boolean;
  disliked: boolean;
}

interface Message {
  role: "assistant" | "user";
  content: string;
  id: string;
  isPricing?: boolean;
  feedback?: MessageFeedback;
  files?: File[];
}

const ChatUI = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [credits, setCredits] = useState(5);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sessionId, setSessionId] = useState<string>("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleUpgradeClick = () => {
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: "",
        id: `pricing-${Date.now()}`,
        isPricing: true,
      },
    ]);
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  useEffect(() => {
    setSessionId(
      `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );
  }, []);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.isPricing && credits <= 0) {
      toast.error("You've run out of credits", {
        description: "Please upgrade to continue chatting",
        duration: 5000,
      });
    }
  }, [messages]);

  const handleWindowKeyPress = (e: KeyboardEvent) => {
    if (
      document.activeElement !== textareaRef.current &&
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.metaKey
    ) {
      if (textareaRef.current) {
        textareaRef.current.focus();
        setInput((prev) => prev + e.key);
      }
    }
  };

  useEffect(() => {
    window.addEventListener("keypress", handleWindowKeyPress);
    return () => {
      window.removeEventListener("keypress", handleWindowKeyPress);
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "inherit";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const handleFeedback = (messageId: string, type: "like" | "dislike") => {
    setMessages((prev) =>
      prev.map((message) => {
        if (message.id === messageId) {
          return {
            ...message,
            feedback: {
              liked: type === "like" ? !message.feedback?.liked : false,
              disliked:
                type === "dislike" ? !message.feedback?.disliked : false,
            },
          };
        }
        return message;
      })
    );
  };

  const handleEditMessage = (messageContent: string) => {
    setInput(messageContent);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const totalSize = files.reduce((acc, file) => acc + file.size, 0);

    if (totalSize > 25 * 1024 * 1024) {
      setError("Total file size exceeds 25MB limit");
      return;
    }

    setSelectedFiles((prev) => [...prev, ...files]);
    setError(null);
  };

  const removeFile = (fileName: string) => {
    setSelectedFiles((prev) => prev.filter((file) => file.name !== fileName));
  };

  const handleQuestionSelect = (question: string) => {
    setInput(question);
    handleFormSubmit(question);
  };

  const handleFormSubmit = async (selectedQuestion?: string) => {
    const messageContent = selectedQuestion || input;
    if ((!messageContent.trim() && selectedFiles.length === 0) || isStreaming)
      return;

    // Credits check
    if (credits <= 0) {
      const lastMessage = messages[messages.length - 1];
      if (!lastMessage?.isPricing) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "",
            id: `pricing-${Date.now()}`,
            isPricing: true,
          },
        ]);
      }
      return;
    }

    setCredits((prev) => prev - 1);

    // Create user message for UI
    const newMessageId = `msg-${Date.now()}`;
    const userMessage = {
      role: "user" as const,
      content: messageContent,
      id: newMessageId,
      files: selectedFiles,
    };

    // Update UI immediately
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setSelectedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    try {
      setIsStreaming(true);

      // Prepare form data
      const formData = new FormData();
      formData.append("message", messageContent);
      formData.append("sessionId", sessionId);
      selectedFiles.forEach((file) => {
        formData.append("files", file);
      });

      // Make API request
      const response = await fetch("/api/chat", {
        method: "POST",
        body: formData,
      });

      if (!response.ok || !response.body) {
        throw new Error("Failed to get response");
      }

      // Create assistant message placeholder
      const assistantMessageId = `assistant-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "",
          id: assistantMessageId,
          feedback: { liked: false, disliked: false },
        },
      ]);

      // Handle streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.content === "[DONE]") continue;
                assistantMessage += data.content;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: assistantMessage }
                      : msg
                  )
                );
              } catch (e) {
                console.error("Error parsing SSE data:", e);
              }
            }
          }
        }
      } finally {
        setIsStreaming(false);
      }
    } catch (error) {
      console.error("Error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
          id: `error-${Date.now()}`,
          feedback: { liked: false, disliked: false },
        },
      ]);
      setIsStreaming(false);
      toast.error("Failed to process message", {
        description: "Please try again",
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() || selectedFiles.length > 0) {
        handleFormSubmit();
      }
    }
  };

  const copyToClipboard = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(messageId);
      setTimeout(() => {
        setCopiedMessageId(null);
      }, 2000);
    } catch (err) {
      setError("Failed to copy to clipboard");
    }
  };

  const renderMessages = () => {
    if (messages.length === 0) {
      return (
        <div className="min-h-[calc(100vh-200px)] flex items-center justify-center">
          <QuickStartCards onQuestionSelect={handleQuestionSelect} />
        </div>
      );
    }

    // Check if there's only one message and it's a pricing message
    const isOnlyPricingMessage = messages.length === 1 && messages[0].isPricing;

    if (isOnlyPricingMessage) {
      return (
        <div className="min-h-[calc(100vh-200px)] flex items-center justify-center">
          <div className="w-full max-w-3xl">
            <Card className="p-4 border border-black/10 bg-white w-full">
              <PricingCards />
            </Card>
          </div>
        </div>
      );
    }

    // Regular message display for all other cases
    return (
      <div className="space-y-6">
        {messages.map((message) => (
          <Card
            key={message.id}
            className={cn(
              "p-4 border border-black/10",
              message.role === "assistant" ? "bg-white" : "bg-black text-white"
            )}
          >
            {message.isPricing ? (
              <PricingCards />
            ) : (
              <div className="flex flex-col space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-sm font-bold ${
                      message.role === "assistant" ? "text-black" : "text-white"
                    }`}
                  >
                    {message.role === "assistant" ? "AstroGPT Assistant" : "You"}
                  </span>

                  {message.files && message.files.length > 0 && (
                    <div className="flex flex-1 justify-center flex-wrap gap-2">
                      {message.files.map((file) => (
                        <div
                          key={file.name}
                          className="flex items-center gap-2 font bg-white rounded-lg p-1 border-white border-2"
                        >
                          <File className="h-3 w-3 text-black" />
                          <span className="text-xs text-black">
                            {file.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {message.role === "user" && !message.isPricing && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 hover:bg-white/10 text-white hover:text-white"
                          onClick={() => handleEditMessage(message.content)}
                        >
                          <PencilIcon className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Edit message</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  className={cn(
                    "prose prose-sm max-w-none break-words",
                    message.role === "assistant" ? "text-black" : "text-white"
                  )}
                  components={{
                    code({ node, inline, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || "");
                      const language = match ? match[1] : "text";
                      return !inline && match ? (
                        <Highlight
                          theme={
                            message.role === "assistant"
                              ? themes.github
                              : themes.dracula
                          }
                          code={String(children).replace(/\n$/, "")}
                          language={language}
                        >
                          {({
                            className,
                            style,
                            tokens,
                            getLineProps,
                            getTokenProps,
                          }) => (
                            <pre
                              className={className}
                              style={{
                                ...style,
                                backgroundColor: "transparent",
                                padding: "1rem",
                                margin: "0.5rem 0",
                                borderRadius: "0.375rem",
                              }}
                            >
                              {tokens.map((line, i) => (
                                <div key={i} {...getLineProps({ line })}>
                                  {line.map((token, key) => (
                                    <span
                                      key={key}
                                      {...getTokenProps({ token })}
                                    />
                                  ))}
                                </div>
                              ))}
                            </pre>
                          )}
                        </Highlight>
                      ) : (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {message.content}
                </ReactMarkdown>

                {message.role === "assistant" && !message.isPricing && (
                  <div className="flex items-center gap-2 mt-2">
                    {/* <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn(
                            "h-8 w-8 hover:bg-black/5",
                            message.feedback?.liked
                              ? "bg-black text-white"
                              : "text-black"
                          )}
                          onClick={() => handleFeedback(message.id, "like")}
                        >
                          <ThumbsUp className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Good response</p>
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn(
                            "h-8 w-8 hover:bg-black/5",
                            message.feedback?.disliked
                              ? "bg-black text-white"
                              : "text-black"
                          )}
                          onClick={() => handleFeedback(message.id, "dislike")}
                        >
                          <ThumbsDown className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Bad response</p>
                      </TooltipContent>
                    </Tooltip> */}

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn(
                            "h-8 w-8 hover:bg-black/5",
                            copiedMessageId === message.id
                              ? "bg-black text-white"
                              : "text-black"
                          )}
                          onClick={() =>
                            copyToClipboard(message.content, message.id)
                          }
                        >
                          {copiedMessageId === message.id ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          {copiedMessageId === message.id
                            ? "Copied!"
                            : "Copy message"}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    );
  };

  if (!mounted) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-[100dvh] relative dark:bg-black">
        {/* Header */}
        {messages.length < 1 && mounted && <ThemeToggleHeader />}

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mx-4 mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Chat Area */}
        <ScrollArea className="flex-1 p-4 flex items-center justify-center">
          <div className="max-w-3xl w-full mx-auto">
            {renderMessages()}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Credits Counter and File Preview */}
        <div className="bg-white dark:bg-black p-1">
          <div className="max-w-3xl mx-auto flex justify-between items-center">
            <div className="flex flex-wrap gap-2">
              {selectedFiles.length > 0 &&
                selectedFiles.map((file) => (
                  <div
                    key={file.name}
                    className="md:ml-[34px] flex items-center gap-2 bg-black/10 dark:bg-white/10 rounded p-1.5"
                  >
                    <File className="h-3 w-3 text-black dark:text-white" />
                    <span className="text-xs text-black dark:text-white">
                      {file.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 hover:bg-black/5"
                      onClick={() =>
                        setSelectedFiles((files) =>
                          files.filter((f) => f.name !== file.name)
                        )
                      }
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
            </div>
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge
                      variant="outline"
                      className="flex items-center gap-2 cursor-pointer p-2"
                    >
                      <Coins className="h-4 w-4 text-gray-600 dark:text-white" />
                      <span className="text-gray-600 dark:text-white">
                        {credits} credits
                      </span>
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {credits} conversations remaining.{" "}
                      <a
                        href="#"
                        onClick={handleUpgradeClick}
                        className="font-bold text-white underline dark:text-black"
                      >
                        <b>Upgrade</b>
                      </a>
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>

        {/* Input Area */}
        <div className="bg-white p-4 border-black/10 dark:bg-black">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleFormSubmit();
            }}
            className="max-w-3xl mx-auto"
          >
            <div className="flex gap-2 items-end">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
                multiple
                accept=".pdf,.csv,.txt"
              />

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Upload files</p>
                </TooltipContent>
              </Tooltip>

              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Start typing and hit Enter"
                className="resize-none bg-white border-black/10 focus:border-black text-black placeholder:text-black/50 text-sm min-h-[44px] py-3 px-4"
                rows={1}
                disabled={isStreaming}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="submit"
                    className="bg-black text-white hover:bg-black/90 h-11 w-11 flex-shrink-0"
                    size="icon"
                    disabled={
                      (!input.trim() && selectedFiles.length === 0) ||
                      credits < 0 ||
                      isStreaming
                    }
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {credits <= 0
                      ? "No credits remaining"
                      : isStreaming
                      ? "Generation in progress"
                      : "Send message"}
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
          </form>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default ChatUI;
