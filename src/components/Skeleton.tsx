import { motion } from "framer-motion";

interface SkeletonProps {
  className?: string;
  rounded?: string;
}

export function Skeleton({ className = "", rounded = "rounded-md" }: SkeletonProps) {
  return (
    <div className={`relative overflow-hidden bg-white/[0.04] ${rounded} ${className}`}>
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent"
        initial={{ x: "-100%" }}
        animate={{ x: "100%" }}
        transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
      />
    </div>
  );
}

export function ChatListSkeleton() {
  return (
    <div className="space-y-1.5 px-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 px-3 py-2.5 rounded-xl">
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-8" />
        </div>
      ))}
    </div>
  );
}

export function DocListSkeleton() {
  return (
    <div className="space-y-1">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 px-2.5 py-2.5 rounded-xl">
          <Skeleton className="h-4 w-4 shrink-0" rounded="rounded-md" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-2 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MessageSkeleton() {
  return (
    <div className="flex gap-3 items-start">
      <Skeleton className="h-8 w-8 shrink-0" rounded="rounded-xl" />
      <div className="flex-1 space-y-2 rounded-2xl bg-white/[0.03] border border-white/[0.05] p-4">
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-9/12" />
        <Skeleton className="h-3 w-7/12" />
      </div>
    </div>
  );
}
