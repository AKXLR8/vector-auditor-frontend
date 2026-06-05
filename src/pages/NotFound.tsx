import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import AnimatedPage from "../components/AnimatedPage";
import { FileSearchIcon } from "@phosphor-icons/react";

export default function NotFound() {
  return (
    <AnimatedPage className="min-h-screen bg-[#000000] flex items-center justify-center p-4">
      <div className="text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
          className="mb-6"
        >
          <FileSearchIcon size={64} className="text-[#2a2a30] mx-auto" />
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-4xl font-semibold text-[#f0f0f0] mb-2"
        >
          404
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-[#a0a0a8] mb-6"
        >
          Page not found
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#00d2ff] text-black rounded-lg text-sm font-semibold hover:bg-[#A4F4FD] transition-colors"
          >
            Back to Home
          </Link>
        </motion.div>
      </div>
    </AnimatedPage>
  );
}
