"use client"

import { motion } from "motion/react"
import { ArrowUpRight, Plus } from "lucide-react"

const links = ["Studio", "Work", "Manifesto", "Journal"]

export function Navbar() {
  return (
    <motion.header
      initial={{ y: -28, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-x-0 top-4 z-50 flex justify-center px-4"
    >
      <nav className="glass-nav flex w-full max-w-3xl items-center justify-between gap-4 rounded-full border border-border px-3 py-2.5 shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2 pl-2" aria-label="Brillance home">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground">
            <span className="h-2 w-2 rounded-full bg-background" />
          </span>
          <span className="font-heading text-lg tracking-tight">blackexe</span>
        </a>

        {/* Links */}
        <ul className="hidden items-center gap-7 md:flex">
          {links.map((link) => (
            <li key={link}>
              <a
                href="#"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {link}
              </a>
            </li>
          ))}
        </ul>

        {/* Circular icon buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Add to list"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-secondary"
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            className="flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm text-background transition-opacity hover:opacity-90"
          >
            Notify me
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      </nav>
    </motion.header>
  )
}
