'use client';

import { motion } from 'framer-motion';

interface NavBarProps {
  onNewChat: () => void;
  onChatHistory: () => void;
  onReports: () => void;
}

export default function NavBar({ onNewChat, onChatHistory, onReports }: NavBarProps) {
  return (
    <motion.nav
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="detective-navbar"
    >
      {/* Logo */}
      <div className="detective-navbar-logo">
        <div className="detective-navbar-logo-icon">
          {/* Broadcast/signal icon */}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
            <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4" />
            <circle cx="12" cy="12" r="2" />
            <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4" />
            <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" />
          </svg>
        </div>
        <span className="detective-navbar-logo-text">
          Evidence<span className="detective-navbar-logo-dot">.</span>AI
        </span>
      </div>

      {/* Navigation Links */}
      <div className="detective-navbar-links">
        <button className="detective-navbar-link" onClick={onReports}>
          CASE FILES
        </button>
        <button className="detective-navbar-link">
          ANALYSIS TOOLS
        </button>
        <button className="detective-navbar-link">
          FORENSIC DATABASE
        </button>
        <button className="detective-navbar-link">
          ABOUT
        </button>
        <button className="detective-navbar-btn" onClick={onNewChat}>
          NEW CHAT
        </button>
        <button className="detective-navbar-btn" onClick={onChatHistory}>
          CHAT HISTORY
        </button>
        <button className="detective-navbar-btn detective-navbar-btn-login">
          LOGIN
        </button>
      </div>
    </motion.nav>
  );
}
