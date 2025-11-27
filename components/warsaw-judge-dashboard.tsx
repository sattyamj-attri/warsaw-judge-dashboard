"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { jsPDF } from "jspdf"
import {
  Shield,
  Clock,
  AlertTriangle,
  Eye,
  Download,
  Bot,
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
  Terminal,
  Skull,
  Radio,
  Zap,
  Target,
  Activity,
  Volume2,
  VolumeX,
  Trophy,
  Award,
  Keyboard,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

// Types
type AgentStatus = "PASS" | "FAIL" | "PROCESSING" | "QUEUED"

interface AuditStep {
  timestamp: string
  action: string
  tool?: string
  input?: unknown
  output?: string
  duration?: number
  status: 'pending' | 'running' | 'completed' | 'failed'
}

interface ToolCall {
  tool: string
  input: unknown
  output: string
  timestamp: string
}

// Vulnerability can be a string or an object
interface VulnerabilityObject {
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  title: string
  description: string
  evidence?: string
}

type Vulnerability = string | VulnerabilityObject

// Helper to convert vulnerability to display string
function vulnerabilityToString(v: Vulnerability): string {
  if (typeof v === "string") return v
  return `[${v.severity}] ${v.title}: ${v.description}`
}

// Helper to get severity from vulnerability
function getVulnerabilitySeverity(v: Vulnerability): string {
  if (typeof v === "string") return "MEDIUM"
  return v.severity
}

interface Agent {
  id: string
  name: string
  avatar: string
  status: AgentStatus
  resilienceScore: number
  safetyRating: "A" | "B" | "C" | "D" | "F" | "-"
  latency: number
  failureReason?: string
  url?: string
  protocol?: string
  auditId?: string
  screenshot?: string
  vulnerabilities?: Vulnerability[]
  steps?: AuditStep[]
  toolCalls?: ToolCall[]
  currentPhase?: string
  logs?: string[]
}

interface LogEntry {
  time: string
  type: "INFO" | "ALERT" | "WARN" | "INJECT" | "SYSTEM"
  message: string
}

// Initial logs - timestamps will be set on client mount to avoid hydration mismatch
const getInitialLogs = (): LogEntry[] => [
  { time: "00:00:00", type: "SYSTEM", message: "WARSAW JUDGE v3.0.0" },
  { time: "00:00:00", type: "INFO", message: "Neural link established..." },
  { time: "00:00:00", type: "INFO", message: "OpenAI Agents SDK: CONNECTED" },
  { time: "00:00:00", type: "INFO", message: "Threat detection: ARMED" },
  { time: "00:00:00", type: "SYSTEM", message: "Awaiting target acquisition..." },
]

// Parse backend log message and convert to LogEntry
function parseBackendLog(logStr: string): LogEntry | null {
  // Format: [timestamp] [LEVEL/SOURCE] message
  // or: [timestamp] [STAGEHAND/LEVEL] message
  const match = logStr.match(/\[([^\]]+)\]\s*\[([^\]]+)\]\s*(.*)/);
  if (match) {
    const [, timestamp, levelSource, message] = match;
    const time = timestamp.includes('T')
      ? new Date(timestamp).toLocaleTimeString('en-US', { hour12: false })
      : timestamp;

    // Determine log type from level/source
    let type: LogEntry["type"] = "INFO";
    const upperLevelSource = levelSource.toUpperCase();
    if (upperLevelSource.includes("ERROR")) type = "ALERT";
    else if (upperLevelSource.includes("WARN")) type = "WARN";
    else if (upperLevelSource.includes("TOOL") || upperLevelSource.includes("STAGEHAND")) type = "INJECT";
    else if (upperLevelSource.includes("AGENT")) type = "INFO";
    else if (upperLevelSource.includes("DEBUG")) type = "SYSTEM";

    return { time, type, message: `[${levelSource}] ${message}` };
  }
  return null;
}

function formatTime(date: Date): string {
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}`
}

// ============================================================================
// MATRIX RAIN EFFECT COMPONENT
// ============================================================================
function MatrixRain({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    // Matrix characters (katakana + numbers + symbols)
    const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF<>{}[]|\\/*-+='
    const charArray = chars.split('')

    const fontSize = 10
    const columns = Math.floor(canvas.width / fontSize)

    // Array to track y position of each column
    const drops: number[] = Array(columns).fill(1)

    // Animation
    const draw = () => {
      // Semi-transparent black to create fade effect
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Green text
      ctx.fillStyle = '#00b48c'
      ctx.font = `${fontSize}px monospace`

      for (let i = 0; i < drops.length; i++) {
        // Random character
        const char = charArray[Math.floor(Math.random() * charArray.length)]

        // Draw character
        ctx.fillText(char, i * fontSize, drops[i] * fontSize)

        // Reset drop randomly after reaching bottom
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0
        }
        drops[i]++
      }
    }

    const interval = setInterval(draw, 50)

    return () => {
      clearInterval(interval)
      window.removeEventListener('resize', resizeCanvas)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={cn("absolute inset-0 opacity-20 pointer-events-none", className)}
    />
  )
}

// ============================================================================
// SOUND EFFECTS SYSTEM
// ============================================================================
const SOUND_EFFECTS = {
  boot: '/sounds/boot.mp3',
  click: '/sounds/click.mp3',
  scan: '/sounds/scan.mp3',
  alert: '/sounds/alert.mp3',
  success: '/sounds/success.mp3',
  fail: '/sounds/fail.mp3',
  type: '/sounds/type.mp3',
} as const

type SoundType = keyof typeof SOUND_EFFECTS

// Sound context for managing audio
function useSoundEffects() {
  const [soundEnabled, setSoundEnabled] = useState(false)
  const audioCache = useRef<Map<string, HTMLAudioElement>>(new Map())

  const playSound = useCallback((sound: SoundType) => {
    if (!soundEnabled) return

    // Use Web Audio API for better performance
    try {
      let audio = audioCache.current.get(sound)
      if (!audio) {
        audio = new Audio(SOUND_EFFECTS[sound])
        audio.volume = 0.3
        audioCache.current.set(sound, audio)
      }
      audio.currentTime = 0
      audio.play().catch(() => {
        // Ignore audio play errors (common on first interaction)
      })
    } catch {
      // Audio not available
    }
  }, [soundEnabled])

  // Generate beep sounds using Web Audio API (no external files needed)
  const playBeep = useCallback((frequency: number = 800, duration: number = 100, type: OscillatorType = 'square') => {
    if (!soundEnabled) return

    try {
      const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.frequency.value = frequency
      oscillator.type = type
      gainNode.gain.value = 0.1

      oscillator.start()
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration / 1000)
      oscillator.stop(audioContext.currentTime + duration / 1000)
    } catch {
      // Web Audio not available
    }
  }, [soundEnabled])

  return { soundEnabled, setSoundEnabled, playSound, playBeep }
}

// ============================================================================
// GLITCH TEXT COMPONENT
// ============================================================================
function GlitchText({ children, active = false, className }: { children: React.ReactNode; active?: boolean; className?: string }) {
  if (!active) return <span className={className}>{children}</span>

  return (
    <span className={cn("relative inline-block", className)}>
      <span className="relative z-10">{children}</span>
      <span
        className="absolute top-0 left-0 -ml-[2px] text-[var(--wj-danger)] opacity-70 animate-pulse"
        style={{ clipPath: 'inset(20% 0 30% 0)' }}
        aria-hidden
      >
        {children}
      </span>
      <span
        className="absolute top-0 left-0 ml-[2px] text-[var(--wj-toxic)] opacity-70"
        style={{ clipPath: 'inset(50% 0 20% 0)', animation: 'glitch 0.3s infinite' }}
        aria-hidden
      >
        {children}
      </span>
    </span>
  )
}

// ============================================================================
// CRT SCANLINE OVERLAY
// ============================================================================
function CRTOverlay() {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {/* Scanlines */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0, 180, 140, 0.1) 1px, rgba(0, 180, 140, 0.1) 2px)',
          backgroundSize: '100% 2px',
        }}
      />
      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.3) 100%)',
        }}
      />
      {/* Subtle flicker */}
      <div className="absolute inset-0 opacity-[0.02] animate-pulse bg-[var(--wj-toxic)]" />
    </div>
  )
}

// ============================================================================
// ACHIEVEMENT BADGE COMPONENT
// ============================================================================
interface Achievement {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  unlocked: boolean
  unlockedAt?: Date
}

function AchievementBadge({ achievement }: { achievement: Achievement }) {
  return (
    <motion.div
      initial={{ scale: 0, rotate: -180 }}
      animate={{ scale: 1, rotate: 0 }}
      className={cn(
        "relative p-3 rounded-lg border text-center transition-all",
        achievement.unlocked
          ? "bg-[var(--wj-toxic)]/10 border-[var(--wj-toxic)]/50"
          : "bg-black/50 border-[var(--wj-toxic)]/20 opacity-50 grayscale"
      )}
    >
      <div className="text-2xl mb-1">{achievement.icon}</div>
      <div className="text-[10px] font-bold text-[var(--wj-toxic)]">{achievement.name}</div>
      <div className="text-[8px] text-[var(--wj-toxic)]/60">{achievement.description}</div>
      {achievement.unlocked && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-1 -right-1 w-4 h-4 bg-[var(--wj-toxic)] rounded-full flex items-center justify-center"
        >
          <CheckCircle2 className="w-3 h-3 text-black" />
        </motion.div>
      )}
    </motion.div>
  )
}

// Achievement definitions
const ACHIEVEMENTS: Omit<Achievement, 'unlocked' | 'unlockedAt'>[] = [
  { id: 'first_blood', name: 'FIRST BLOOD', description: 'Complete first audit', icon: <Target className="w-5 h-5" /> },
  { id: 'perfect', name: 'PERFECT', description: 'Score 100%', icon: <Trophy className="w-5 h-5" /> },
  { id: 'bug_hunter', name: 'BUG HUNTER', description: 'Find 10+ vulnerabilities', icon: <Skull className="w-5 h-5" /> },
  { id: 'speed_demon', name: 'SPEED DEMON', description: 'Audit under 30s', icon: <Zap className="w-5 h-5" /> },
  { id: 'protocol_master', name: 'PROTOCOL MASTER', description: 'Use all protocols', icon: <Award className="w-5 h-5" /> },
  { id: 'night_owl', name: 'NIGHT OWL', description: 'Audit at midnight', icon: <Eye className="w-5 h-5" /> },
]

// ============================================================================
// TYPING TEXT EFFECT FOR LOGS
// ============================================================================
function TypingText({ text, speed = 20, className }: { text: string; speed?: number; className?: string }) {
  const [displayedText, setDisplayedText] = useState('')
  const [isComplete, setIsComplete] = useState(false)

  useEffect(() => {
    if (isComplete) return

    let index = 0
    const interval = setInterval(() => {
      if (index < text.length) {
        setDisplayedText(text.substring(0, index + 1))
        index++
      } else {
        setIsComplete(true)
        clearInterval(interval)
      }
    }, speed)

    return () => clearInterval(interval)
  }, [text, speed, isComplete])

  return <span className={className}>{displayedText}{!isComplete && <span className="opacity-50">▌</span>}</span>
}

// ============================================================================
// KEYBOARD SHORTCUTS DISPLAY
// ============================================================================
function KeyboardShortcutsHelp({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    { key: 'Ctrl + Enter', action: 'Start audit' },
    { key: 'Ctrl + E', action: 'Export report' },
    { key: 'Ctrl + K', action: 'Command palette' },
    { key: 'Escape', action: 'Close modal' },
    { key: '1-9', action: 'Select protocol' },
    { key: 'Ctrl + S', action: 'Toggle sound' },
    { key: '?', action: 'Show shortcuts' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-black border border-[var(--wj-toxic)]/50 rounded-lg p-6 max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <Keyboard className="w-5 h-5 text-[var(--wj-toxic)]" />
          <h3 className="text-[var(--wj-toxic)] font-bold tracking-wider">KEYBOARD SHORTCUTS</h3>
        </div>
        <div className="space-y-2">
          {shortcuts.map(({ key, action }) => (
            <div key={key} className="flex justify-between items-center">
              <span className="text-[var(--wj-toxic)]/70 text-sm">{action}</span>
              <kbd className="px-2 py-1 bg-[var(--wj-toxic)]/10 border border-[var(--wj-toxic)]/30 rounded text-xs text-[var(--wj-toxic)] font-mono">
                {key}
              </kbd>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-[var(--wj-toxic)]/20">
          <Button
            onClick={onClose}
            className="w-full bg-[var(--wj-toxic)]/20 border border-[var(--wj-toxic)]/50 text-[var(--wj-toxic)] hover:bg-[var(--wj-toxic)]/30"
          >
            Close
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

// Threat Radar Component
function ThreatRadar({ threats, isScanning }: { threats: number; isScanning: boolean }) {
  return (
    <div className="relative w-32 h-32 mx-auto">
      {/* Radar background */}
      <div className="absolute inset-0 rounded-full border border-[var(--wj-toxic)]/30 bg-black/50" />
      <div className="absolute inset-4 rounded-full border border-[var(--wj-toxic)]/20" />
      <div className="absolute inset-8 rounded-full border border-[var(--wj-toxic)]/10" />

      {/* Cross hairs */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-full h-px bg-[var(--wj-toxic)]/20" />
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="h-full w-px bg-[var(--wj-toxic)]/20" />
      </div>

      {/* Scanning sweep */}
      {isScanning && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background: "conic-gradient(from 0deg, transparent 0deg, var(--wj-toxic) 30deg, transparent 60deg)",
            opacity: 0.3,
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        />
      )}

      {/* Pulse rings */}
      {isScanning && (
        <>
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-[var(--wj-toxic)]"
            initial={{ scale: 0.3, opacity: 1 }}
            animate={{ scale: 1.2, opacity: 0 }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
          />
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-[var(--wj-toxic)]"
            initial={{ scale: 0.3, opacity: 1 }}
            animate={{ scale: 1.2, opacity: 0 }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 1 }}
          />
        </>
      )}

      {/* Center dot */}
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          className={cn(
            "w-3 h-3 rounded-full",
            threats > 0 ? "bg-[var(--wj-danger)]" : "bg-[var(--wj-toxic)]"
          )}
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      </div>

      {/* Threat indicators */}
      {threats > 0 && (
        <motion.div
          className="absolute top-4 right-4 w-2 h-2 rounded-full bg-[var(--wj-danger)]"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 0.5, repeat: Infinity }}
        />
      )}
    </div>
  )
}

// ASCII Header Component
function AsciiHeader() {
  return (
    <div className="text-[var(--wj-toxic)] text-[10px] leading-none font-mono opacity-60 select-none overflow-hidden">
      <pre>{`
╔═══════════════════════════════════════════════════════════════════════════════╗
║  ██╗    ██╗ █████╗ ██████╗ ███████╗ █████╗ ██╗    ██╗                         ║
║  ██║    ██║██╔══██╗██╔══██╗██╔════╝██╔══██╗██║    ██║    ░░█ █░█ █▀▄ █▀▀ █▀▀  ║
║  ██║ █╗ ██║███████║██████╔╝███████╗███████║██║ █╗ ██║    ░░█ █░█ █░█ █░█ ██▄  ║
║  ██║███╗██║██╔══██║██╔══██╗╚════██║██╔══██║██║███╗██║    █▄█ ▀▄▀ ▀▀░ ▀▀▀ ▀▀▀  ║
║  ╚███╔███╔╝██║  ██║██║  ██║███████║██║  ██║╚███╔███╔╝                         ║
║   ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝  [ CYBER COMMAND v3.0 ] ║
╚═══════════════════════════════════════════════════════════════════════════════╝`}</pre>
    </div>
  )
}

export function WarsawJudgeDashboard() {
  const [logs, setLogs] = useState<LogEntry[]>(getInitialLogs())
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [agents, setAgents] = useState<Agent[]>([])
  const [agentUrl, setAgentUrl] = useState("")
  const [auditProtocol, setAuditProtocol] = useState("all")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [breachDetected, setBreachDetected] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [unlockedAchievements, setUnlockedAchievements] = useState<Set<string>>(new Set())
  const [showCRT, setShowCRT] = useState(true)
  const terminalRef = useRef<HTMLDivElement>(null)
  const pollingRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  // Sound effects
  const { soundEnabled, setSoundEnabled, playBeep } = useSoundEffects()

  // Set initial timestamps after hydration to avoid mismatch
  useEffect(() => {
    const currentTime = formatTime(new Date())
    setLogs(prev => prev.map(log => ({ ...log, time: currentTime })))
    setIsHydrated(true)
    // Play boot sound
    playBeep(200, 100, 'sine')
    setTimeout(() => playBeep(400, 100, 'sine'), 100)
    setTimeout(() => playBeep(600, 150, 'sine'), 200)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl + Enter - Start audit
      if (e.ctrlKey && e.key === 'Enter' && agentUrl.trim() && !isSubmitting) {
        e.preventDefault()
        handleInitiateAudit()
      }
      // Ctrl + S - Toggle sound
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        setSoundEnabled(prev => !prev)
        playBeep(600, 50, 'sine')
      }
      // ? - Show shortcuts
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        setShowShortcuts(prev => !prev)
      }
      // Escape - Close modals
      if (e.key === 'Escape') {
        setShowShortcuts(false)
        setSelectedAgent(null)
      }
      // 1-9 - Select protocol (when not typing in input)
      if (!e.ctrlKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
        const target = e.target as HTMLElement
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          const protocols = ['all', 'generic', 'finance', 'medical', 'legal', 'owasp_llm', 'rag_security', 'pci_ecommerce', 'wcag_accessibility']
          const idx = parseInt(e.key) - 1
          if (idx < protocols.length) {
            setAuditProtocol(protocols[idx])
            playBeep(400 + idx * 50, 50, 'square')
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [agentUrl, isSubmitting, playBeep, setSoundEnabled])

  // Achievement tracking
  useEffect(() => {
    const completedAgents = agents.filter(a => a.status === 'PASS' || a.status === 'FAIL')
    const passedAgents = agents.filter(a => a.status === 'PASS')
    const newAchievements = new Set(unlockedAchievements)

    // First Blood - Complete first audit
    if (completedAgents.length >= 1 && !unlockedAchievements.has('first_blood')) {
      newAchievements.add('first_blood')
      playBeep(800, 100, 'sine')
      setTimeout(() => playBeep(1000, 100, 'sine'), 100)
      setTimeout(() => playBeep(1200, 200, 'sine'), 200)
    }

    // Perfect - Score 100%
    if (passedAgents.some(a => a.resilienceScore === 100) && !unlockedAchievements.has('perfect')) {
      newAchievements.add('perfect')
    }

    // Bug Hunter - Find 10+ vulnerabilities
    const totalVulns = agents.reduce((sum, a) => sum + (a.vulnerabilities?.length || 0), 0)
    if (totalVulns >= 10 && !unlockedAchievements.has('bug_hunter')) {
      newAchievements.add('bug_hunter')
    }

    // Speed Demon - Audit under 30s
    if (completedAgents.some(a => a.latency > 0 && a.latency < 30000) && !unlockedAchievements.has('speed_demon')) {
      newAchievements.add('speed_demon')
    }

    // Protocol Master - Use all protocols
    const usedProtocols = new Set(agents.map(a => a.protocol).filter(Boolean))
    if (usedProtocols.size >= 5 && !unlockedAchievements.has('protocol_master')) {
      newAchievements.add('protocol_master')
    }

    // Night Owl - Audit at midnight (between 11pm and 4am)
    const hour = new Date().getHours()
    if ((hour >= 23 || hour < 4) && completedAgents.length > 0 && !unlockedAchievements.has('night_owl')) {
      newAchievements.add('night_owl')
    }

    if (newAchievements.size > unlockedAchievements.size) {
      setUnlockedAchievements(newAchievements)
    }
  }, [agents, unlockedAchievements, playBeep])

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [logs])

  // Add log helper
  const addLog = useCallback((type: LogEntry["type"], message: string) => {
    setLogs((prev) => [...prev, { time: formatTime(new Date()), type, message }])
  }, [])

  // Breach effect trigger
  useEffect(() => {
    const failedAgents = agents.filter(a => a.status === "FAIL").length
    if (failedAgents > 0) {
      setBreachDetected(true)
      // Alert sound - descending tones
      playBeep(800, 150, 'sawtooth')
      setTimeout(() => playBeep(600, 150, 'sawtooth'), 150)
      setTimeout(() => playBeep(400, 200, 'sawtooth'), 300)
      const timer = setTimeout(() => setBreachDetected(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [agents, playBeep])

  // Track which backend logs we've already processed
  const processedLogsRef = useRef<Map<string, number>>(new Map())

  // Poll for audit status
  const pollAuditStatus = useCallback(async (auditId: string, agentId: string) => {
    try {
      const response = await fetch(`/api/audit?auditId=${auditId}`)
      if (!response.ok) return

      const data = await response.json()

      // Process new backend logs and add to UI
      const backendLogs: string[] = data.logs || []
      const lastProcessed = processedLogsRef.current.get(auditId) || 0
      const newBackendLogs = backendLogs.slice(lastProcessed)

      if (newBackendLogs.length > 0) {
        const parsedLogs: LogEntry[] = []
        for (const logStr of newBackendLogs) {
          const parsed = parseBackendLog(logStr)
          if (parsed) {
            parsedLogs.push(parsed)
          }
        }
        if (parsedLogs.length > 0) {
          setLogs((prev) => [...prev, ...parsedLogs])
        }
        processedLogsRef.current.set(auditId, backendLogs.length)
      }

      setAgents((prev) =>
        prev.map((agent) => {
          if (agent.id !== agentId) return agent

          const newStatus = data.status as AgentStatus

          if (newStatus !== agent.status) {
            if (newStatus === "PROCESSING" && agent.status === "QUEUED") {
              addLog("INFO", `>> Engaging target: ${agent.name}`)
              playBeep(500, 100, 'sine')
            } else if (newStatus === "PASS") {
              addLog("INFO", `Target ${agent.name}: SECURE`)
              // Success sound - ascending chime
              playBeep(600, 100, 'sine')
              setTimeout(() => playBeep(800, 100, 'sine'), 100)
              setTimeout(() => playBeep(1000, 150, 'sine'), 200)
            } else if (newStatus === "FAIL") {
              addLog("ALERT", `BREACH DETECTED: ${agent.name}`)
              // Handled by breach effect
            }
          }

          if (newStatus === "PASS" || newStatus === "FAIL") {
            const interval = pollingRef.current.get(auditId)
            if (interval) {
              clearInterval(interval)
              pollingRef.current.delete(auditId)
            }
            // Clean up processed logs tracking for this audit
            processedLogsRef.current.delete(auditId)
          }

          return {
            ...agent,
            status: newStatus,
            resilienceScore: data.result?.resilienceScore ?? agent.resilienceScore,
            safetyRating: data.result?.safetyRating ?? agent.safetyRating,
            latency: data.result?.latency ?? data.duration ?? agent.latency,
            failureReason: data.result?.criticalFailure ?? data.result?.vulnerabilities?.map((v: Vulnerability) => vulnerabilityToString(v)).join(", "),
            screenshot: data.screenshot,
            vulnerabilities: data.result?.vulnerabilities,
            steps: data.steps,
            toolCalls: data.toolCalls,
            currentPhase: data.currentPhase,
            logs: data.logs,
          }
        })
      )
    } catch (error) {
      console.error("Polling error:", error)
    }
  }, [addLog, playBeep])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      pollingRef.current.forEach((interval) => clearInterval(interval))
    }
  }, [])

  // Simulate audit steps for active audits
  useEffect(() => {
    const hasActiveAudit = agents.some((a) => a.status === "PROCESSING" || a.status === "QUEUED")
    if (!hasActiveAudit) return

    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % 4)
    }, 2500)
    return () => clearInterval(interval)
  }, [agents])

  const handleInitiateAudit = async () => {
    if (!agentUrl.trim() || isSubmitting) return

    setIsSubmitting(true)
    const agentId = `agent_${Date.now()}`
    const protocol = auditProtocol || "generic"
    const protocolNames: Record<string, string> = {
      generic: "STRESS_TEST",
      finance: "FINANCE_AUDIT",
      medical: "HIPAA_SCAN",
      legal: "CONTRACT_PROBE",
    }

    const newAgent: Agent = {
      id: agentId,
      name: extractAgentName(agentUrl),
      avatar: generateAvatar(agentUrl),
      status: "QUEUED",
      resilienceScore: 0,
      safetyRating: "-",
      latency: 0,
      url: agentUrl,
      protocol: protocolNames[protocol],
    }

    setAgents((prev) => [...prev, newAgent])
    addLog("SYSTEM", `═══════════════════════════════════`)
    addLog("INFO", `Target acquired: ${newAgent.name}`)
    addLog("INJECT", `Protocol: ${newAgent.protocol}`)

    // Launch sound - quick ascending beeps
    playBeep(300, 50, 'square')
    setTimeout(() => playBeep(400, 50, 'square'), 50)
    setTimeout(() => playBeep(500, 50, 'square'), 100)

    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: agentUrl, testType: protocol }),
      })

      if (!response.ok) {
        throw new Error("Failed to initiate audit")
      }

      const data = await response.json()

      setAgents((prev) =>
        prev.map((agent) =>
          agent.id === agentId ? { ...agent, auditId: data.auditId } : agent
        )
      )

      addLog("INFO", `Audit ID: ${data.auditId}`)
      addLog("INFO", `Deploying agent swarm...`)

      const pollInterval = setInterval(() => {
        pollAuditStatus(data.auditId, agentId)
      }, 3000)

      pollingRef.current.set(data.auditId, pollInterval)
      pollAuditStatus(data.auditId, agentId)

    } catch (error) {
      console.error("Audit initiation error:", error)
      addLog("ALERT", `CONNECTION FAILED: ${error instanceof Error ? error.message : "Unknown error"}`)

      setAgents((prev) =>
        prev.map((agent) =>
          agent.id === agentId
            ? { ...agent, status: "FAIL", failureReason: "Connection terminated" }
            : agent
        )
      )
    } finally {
      setIsSubmitting(false)
      setAgentUrl("")
      setAuditProtocol("")
    }
  }

  const stats = {
    agentsActive: agents.length,
    threatsDetected: agents.filter((a) => a.status === "FAIL").length,
    avgLatency:
      agents.length > 0 && agents.some((a) => a.latency > 0)
        ? `${Math.round(agents.filter((a) => a.latency > 0).reduce((sum, a) => sum + a.latency, 0) / agents.filter((a) => a.latency > 0).length)}ms`
        : "---",
  }

  // Export audit report as PDF - Professional structured format
  const exportAuditReport = useCallback((agent: Agent) => {
    const pdf = new jsPDF()
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 20
    const contentWidth = pageWidth - margin * 2
    let y = margin

    // Color definitions
    const colors = {
      primary: [0, 180, 140] as [number, number, number],      // Teal/green
      danger: [220, 53, 69] as [number, number, number],       // Red
      warning: [255, 193, 7] as [number, number, number],      // Yellow
      dark: [33, 37, 41] as [number, number, number],          // Dark gray
      muted: [108, 117, 125] as [number, number, number],      // Gray
      light: [248, 249, 250] as [number, number, number],      // Light gray
    }

    // Helper: Add wrapped text
    const addWrappedText = (text: string, x: number, yPos: number, maxWidth: number, lineHeight: number = 6): number => {
      const lines = pdf.splitTextToSize(text, maxWidth)
      pdf.text(lines, x, yPos)
      return yPos + lines.length * lineHeight
    }

    // Helper: Check page break
    const checkPageBreak = (neededSpace: number): void => {
      if (y + neededSpace > pageHeight - 25) {
        pdf.addPage()
        y = margin
      }
    }

    // Helper: Draw section header
    const drawSectionHeader = (title: string, color: [number, number, number] = colors.dark): void => {
      checkPageBreak(25)
      pdf.setFillColor(color[0], color[1], color[2])
      pdf.rect(margin, y - 2, contentWidth, 10, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(11)
      pdf.setFont("helvetica", "bold")
      pdf.text(title.toUpperCase(), margin + 4, y + 5)
      pdf.setTextColor(0, 0, 0)
      y += 15
    }

    // Helper: Draw key-value row
    const drawKeyValue = (key: string, value: string, keyWidth: number = 45): void => {
      checkPageBreak(8)
      pdf.setFontSize(10)
      pdf.setFont("helvetica", "bold")
      pdf.setTextColor(colors.muted[0], colors.muted[1], colors.muted[2])
      pdf.text(key, margin, y)
      pdf.setFont("helvetica", "normal")
      pdf.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2])
      pdf.text(value, margin + keyWidth, y)
      y += 7
    }

    // Helper: Draw horizontal line
    const drawLine = (): void => {
      pdf.setDrawColor(colors.light[0], colors.light[1], colors.light[2])
      pdf.setLineWidth(0.5)
      pdf.line(margin, y, pageWidth - margin, y)
      y += 5
    }

    // ========== HEADER ==========
    // Logo area with background
    pdf.setFillColor(colors.dark[0], colors.dark[1], colors.dark[2])
    pdf.rect(0, 0, pageWidth, 45, 'F')

    pdf.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2])
    pdf.setFontSize(28)
    pdf.setFont("helvetica", "bold")
    pdf.text("WARSAW JUDGE", margin, 22)

    pdf.setTextColor(255, 255, 255)
    pdf.setFontSize(12)
    pdf.setFont("helvetica", "normal")
    pdf.text("Security Audit Report", margin, 34)

    // Report date on right
    pdf.setFontSize(9)
    pdf.setTextColor(colors.muted[0], colors.muted[1], colors.muted[2])
    const dateStr = new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })
    pdf.text(dateStr, pageWidth - margin - pdf.getTextWidth(dateStr), 34)

    y = 55

    // ========== EXECUTIVE SUMMARY BOX ==========
    const summaryBoxHeight = 35
    const isPassed = agent.status === "PASS"
    const boxColor = isPassed ? colors.primary : colors.danger

    pdf.setFillColor(boxColor[0], boxColor[1], boxColor[2])
    pdf.roundedRect(margin, y, contentWidth, summaryBoxHeight, 3, 3, 'F')

    // Status
    pdf.setTextColor(255, 255, 255)
    pdf.setFontSize(20)
    pdf.setFont("helvetica", "bold")
    const statusLabel = isPassed ? "SECURE" : "VULNERABILITIES DETECTED"
    pdf.text(statusLabel, margin + 10, y + 15)

    // Score on right side of box
    pdf.setFontSize(14)
    pdf.text(`Score: ${agent.resilienceScore}%`, margin + 10, y + 28)
    pdf.text(`Grade: ${agent.safetyRating}`, margin + 80, y + 28)
    pdf.text(`Latency: ${(agent.latency / 1000).toFixed(1)}s`, margin + 130, y + 28)

    y += summaryBoxHeight + 15

    // ========== TARGET INFORMATION ==========
    drawSectionHeader("Target Information", colors.dark)

    drawKeyValue("Target Name:", agent.name)
    drawKeyValue("URL:", agent.url || "N/A")
    drawKeyValue("Protocol:", agent.protocol?.toUpperCase() || "N/A")
    drawKeyValue("Audit ID:", agent.auditId || "N/A")
    y += 5

    // ========== AUDIT RESULTS ==========
    drawSectionHeader("Audit Results", colors.dark)

    // Results table
    const resultsData = [
      ["Overall Status", isPassed ? "PASS" : "FAIL"],
      ["Resilience Score", `${agent.resilienceScore}/100`],
      ["Safety Rating", agent.safetyRating],
      ["Response Time", `${agent.latency}ms (${(agent.latency / 1000).toFixed(2)}s)`],
      ["Vulnerabilities", `${agent.vulnerabilities?.length || 0} found`],
    ]

    resultsData.forEach(([key, value]) => {
      drawKeyValue(key + ":", value)
    })
    y += 5

    // ========== VULNERABILITIES ==========
    if (agent.vulnerabilities && agent.vulnerabilities.length > 0) {
      drawSectionHeader(`Vulnerabilities (${agent.vulnerabilities.length})`, colors.danger)

      agent.vulnerabilities.forEach((v, i) => {
        checkPageBreak(25)

        const severity = typeof v === 'string' ? 'MEDIUM' : v.severity
        const title = typeof v === 'string' ? v : v.title
        const description = typeof v === 'string' ? '' : v.description

        // Severity badge color
        let severityColor: [number, number, number] = colors.muted
        if (severity === 'CRITICAL') severityColor = [139, 0, 0]
        else if (severity === 'HIGH') severityColor = colors.danger
        else if (severity === 'MEDIUM') severityColor = [255, 140, 0]
        else if (severity === 'LOW') severityColor = colors.warning

        // Vulnerability number and severity
        pdf.setFontSize(10)
        pdf.setFont("helvetica", "bold")
        pdf.setTextColor(severityColor[0], severityColor[1], severityColor[2])
        pdf.text(`#${i + 1} [${severity}]`, margin, y)

        // Title
        pdf.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2])
        pdf.text(title, margin + 35, y)
        y += 6

        // Description if available
        if (description) {
          pdf.setFont("helvetica", "normal")
          pdf.setFontSize(9)
          pdf.setTextColor(colors.muted[0], colors.muted[1], colors.muted[2])
          y = addWrappedText(description, margin + 5, y, contentWidth - 10, 5)
        }
        y += 4
        drawLine()
      })
    } else {
      drawSectionHeader("Vulnerabilities", colors.primary)
      pdf.setFontSize(11)
      pdf.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2])
      pdf.text("No vulnerabilities detected during this audit.", margin, y)
      y += 10
    }

    // ========== ANALYSIS SUMMARY (as bullet points) ==========
    if (agent.failureReason) {
      // Parse the failure reason into bullet points
      // Split by common delimiters: commas between brackets, periods, or existing bullet patterns
      let bulletPoints: string[] = []

      // Try to extract individual findings from the analysis text
      const analysisText = agent.failureReason

      // Split by "], [" pattern (common in vulnerability lists)
      if (analysisText.includes('], [')) {
        bulletPoints = analysisText
          .split(/\],\s*\[/)
          .map(s => s.replace(/^\[|\]$/g, '').trim())
          .filter(s => s.length > 0)
      }
      // Split by period followed by space and capital letter or bracket
      else if (analysisText.includes('. [') || analysisText.match(/\.\s+[A-Z]/)) {
        bulletPoints = analysisText
          .split(/\.\s+(?=\[|[A-Z])/)
          .map(s => s.trim().replace(/\.$/, ''))
          .filter(s => s.length > 0)
      }
      // Just use the whole text if no pattern found
      else {
        bulletPoints = [analysisText]
      }

      // Limit to 6 bullet points max, truncate each to ~150 chars
      bulletPoints = bulletPoints.slice(0, 6).map(point => {
        // Extract severity and title if in format "[SEVERITY] Title: Description"
        const match = point.match(/^\[?(\w+)\]?\s*(.+)/)
        if (match) {
          const content = match[2]
          // Truncate long descriptions
          if (content.length > 150) {
            const colonIdx = content.indexOf(':')
            if (colonIdx > 0 && colonIdx < 80) {
              // Keep title, truncate description
              return content.substring(0, Math.min(150, content.indexOf('.', colonIdx) + 1 || 150))
            }
            return content.substring(0, 147) + '...'
          }
          return content
        }
        return point.length > 150 ? point.substring(0, 147) + '...' : point
      })

      // Calculate space needed (header + bullets)
      const spaceNeeded = 20 + bulletPoints.length * 12
      checkPageBreak(spaceNeeded)

      drawSectionHeader("Analysis Summary", colors.dark)

      pdf.setFontSize(9)
      pdf.setFont("helvetica", "normal")

      bulletPoints.forEach((point) => {
        checkPageBreak(12)

        // Bullet point
        pdf.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2])
        pdf.text("\u2022", margin, y)

        // Text
        pdf.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2])
        const lines = pdf.splitTextToSize(point, contentWidth - 8)
        // Limit to 2 lines per bullet
        const limitedLines = lines.slice(0, 2)
        pdf.text(limitedLines, margin + 6, y)
        y += limitedLines.length * 5 + 3
      })
      y += 5
    }

    // ========== EXECUTION STEPS ==========
    if (agent.steps && agent.steps.length > 0) {
      drawSectionHeader("Execution Steps", colors.dark)

      agent.steps.forEach((step, i) => {
        checkPageBreak(10)
        const statusIcon = step.status === 'completed' ? '[OK]' : step.status === 'failed' ? '[FAIL]' : '[...]'
        const statusColor = step.status === 'completed' ? colors.primary :
                           step.status === 'failed' ? colors.danger : colors.muted

        pdf.setFontSize(9)
        pdf.setFont("helvetica", "bold")
        pdf.setTextColor(statusColor[0], statusColor[1], statusColor[2])
        pdf.text(statusIcon, margin, y)

        pdf.setFont("helvetica", "normal")
        pdf.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2])
        pdf.text(step.action, margin + 15, y)
        y += 6
      })
      y += 5
    }

    // ========== TOOL CALLS ==========
    if (agent.toolCalls && agent.toolCalls.length > 0) {
      drawSectionHeader(`Agent Actions (${agent.toolCalls.length} tool calls)`, colors.dark)

      // Group tool calls by tool name
      const toolCounts: Record<string, number> = {}
      agent.toolCalls.forEach(tc => {
        toolCounts[tc.tool] = (toolCounts[tc.tool] || 0) + 1
      })

      pdf.setFontSize(9)
      Object.entries(toolCounts).forEach(([tool, count]) => {
        checkPageBreak(8)
        pdf.setFont("helvetica", "normal")
        pdf.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2])
        pdf.text(`${tool}`, margin, y)
        pdf.setTextColor(colors.muted[0], colors.muted[1], colors.muted[2])
        pdf.text(`x${count}`, margin + 60, y)
        y += 6
      })
      y += 5
    }

    // ========== FOOTER ON EACH PAGE ==========
    const totalPages = pdf.getNumberOfPages()
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i)

      // Footer line
      pdf.setDrawColor(colors.light[0], colors.light[1], colors.light[2])
      pdf.setLineWidth(0.5)
      pdf.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15)

      // Footer text
      pdf.setFontSize(8)
      pdf.setTextColor(colors.muted[0], colors.muted[1], colors.muted[2])
      pdf.text("Warsaw Judge v4.0 - AI Security Auditor", margin, pageHeight - 8)
      pdf.text(`Page ${i} of ${totalPages}`, pageWidth - margin - 25, pageHeight - 8)
    }

    // Save the PDF
    const safeName = agent.name.toLowerCase().replace(/[^a-z0-9]/g, '_')
    pdf.save(`warsaw-judge-report-${safeName}-${Date.now()}.pdf`)

    // Log for feedback
    addLog("INFO", `PDF report exported: ${agent.name}`)
  }, [addLog])

  const isScanning = agents.some(a => a.status === "PROCESSING" || a.status === "QUEUED")

  return (
    <div className={cn(
      "min-h-screen bg-black text-[var(--wj-toxic)] p-4 md:p-6 lg:p-8 cyber-grid",
      breachDetected && "glitch-text"
    )}>
      {/* CRT Scanline Overlay */}
      {showCRT && <CRTOverlay />}

      {/* Keyboard Shortcuts Modal */}
      <AnimatePresence>
        {showShortcuts && <KeyboardShortcutsHelp onClose={() => setShowShortcuts(false)} />}
      </AnimatePresence>

      {/* Breach Alert Overlay */}
      <AnimatePresence>
        {breachDetected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center"
          >
            <motion.div
              className="text-6xl md:text-8xl font-bold text-[var(--wj-danger)] danger-glow flicker"
              initial={{ scale: 0.5 }}
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 0.3, repeat: 3 }}
            >
              <GlitchText active>{`BREACH DETECTED`}</GlitchText>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Actions Bar - Sound, CRT, Shortcuts */}
      <div className="fixed top-4 right-4 z-40 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSoundEnabled(prev => !prev)}
          className={cn(
            "h-8 w-8 p-0 border transition-all",
            soundEnabled
              ? "border-[var(--wj-toxic)]/50 text-[var(--wj-toxic)] bg-[var(--wj-toxic)]/10"
              : "border-[var(--wj-toxic)]/20 text-[var(--wj-toxic)]/30"
          )}
          title={soundEnabled ? "Mute sounds" : "Enable sounds"}
        >
          {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowShortcuts(true)}
          className="h-8 w-8 p-0 border border-[var(--wj-toxic)]/20 text-[var(--wj-toxic)]/50 hover:text-[var(--wj-toxic)] hover:border-[var(--wj-toxic)]/50"
          title="Keyboard shortcuts (?)"
        >
          <Keyboard className="h-4 w-4" />
        </Button>
      </div>

      {/* ASCII Header */}
      <div className="mb-6 hidden lg:block">
        <AsciiHeader />
      </div>

      {/* Mobile Header */}
      <div className="lg:hidden mb-6">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-[var(--wj-toxic)] toxic-glow-subtle" />
          <div>
            <h1 className="text-xl font-bold tracking-wider toxic-glow-subtle">WARSAW JUDGE</h1>
            <p className="text-[10px] tracking-[0.3em] text-[var(--wj-toxic)]/50 uppercase">Cyber Command</p>
          </div>
        </div>
      </div>

      {/* Command Bar */}
      <Card className="mb-6 bg-black/80 border-[var(--wj-toxic)]/30 p-4 relative overflow-hidden border-glow">
        {/* Corner decorations */}
        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[var(--wj-toxic)]" />
        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[var(--wj-toxic)]" />
        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[var(--wj-toxic)]" />
        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[var(--wj-toxic)]" />

        <div className="relative flex flex-col lg:flex-row gap-4 items-stretch lg:items-end">
          <div className="flex-1">
            <label className="block text-[10px] tracking-[0.3em] text-[var(--wj-toxic)]/70 uppercase mb-2">
              &gt; TARGET_URL
            </label>
            <Input
              placeholder="https://target.app"
              value={agentUrl}
              onChange={(e) => setAgentUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleInitiateAudit()}
              disabled={isSubmitting}
              className="h-12 bg-black border-[var(--wj-toxic)]/30 text-[var(--wj-toxic)] placeholder:text-[var(--wj-toxic)]/30 font-mono focus:border-[var(--wj-toxic)] focus:ring-[var(--wj-toxic)]/30 transition-all"
            />
          </div>

          <div className="lg:w-[240px]">
            <label className="block text-[10px] tracking-[0.3em] text-[var(--wj-toxic)]/70 uppercase mb-2">
              &gt; PROTOCOL
            </label>
            <Select value={auditProtocol} onValueChange={setAuditProtocol} disabled={isSubmitting}>
              <SelectTrigger className="h-12 bg-black border-[var(--wj-toxic)]/30 text-[var(--wj-toxic)] focus:ring-[var(--wj-toxic)]/30">
                <SelectValue placeholder="SELECT" />
              </SelectTrigger>
              <SelectContent className="bg-black border-[var(--wj-toxic)]/30 max-h-[400px]">
                <SelectItem value="all" className="text-[var(--wj-danger)] font-bold">FULL_AUDIT (ALL)</SelectItem>
                <SelectItem value="generic">STRESS_TEST</SelectItem>
                <SelectItem value="finance">FINANCE_AUDIT</SelectItem>
                <SelectItem value="medical">HIPAA_SCAN</SelectItem>
                <SelectItem value="legal">CONTRACT_PROBE</SelectItem>
                <SelectItem value="owasp_llm">LLM_SECURITY</SelectItem>
                <SelectItem value="rag_security">RAG_SECURITY</SelectItem>
                <SelectItem value="pci_ecommerce">ECOMMERCE_AUDIT</SelectItem>
                <SelectItem value="wcag_accessibility">ACCESSIBILITY</SelectItem>
                <SelectItem value="gdpr_privacy">GDPR_PRIVACY</SelectItem>
                <SelectItem value="api_security">API_SECURITY</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleInitiateAudit}
            disabled={!agentUrl.trim() || isSubmitting}
            className={cn(
              "h-12 px-8 font-bold text-sm tracking-[0.2em] relative overflow-hidden transition-all border",
              agentUrl.trim() && !isSubmitting
                ? "bg-[var(--wj-toxic)] hover:bg-[var(--wj-toxic)]/80 text-black border-[var(--wj-toxic)]"
                : "bg-transparent text-[var(--wj-toxic)]/30 border-[var(--wj-toxic)]/30 cursor-not-allowed",
            )}
          >
            {agentUrl.trim() && !isSubmitting && (
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                animate={{ x: ["-100%", "100%"] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              />
            )}
            <span className="relative flex items-center gap-2">
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Target className="h-4 w-4" />
              )}
              {isSubmitting ? "ENGAGING..." : "EXECUTE"}
            </span>
          </Button>
        </div>
      </Card>

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard
          icon={<Radio className="h-5 w-5" />}
          label="TARGETS"
          value={stats.agentsActive}
        />
        <StatCard
          icon={<Skull className="h-5 w-5" />}
          label="BREACHES"
          value={stats.threatsDetected}
          variant={stats.threatsDetected > 0 ? "danger" : "default"}
        />
        <StatCard
          icon={<Zap className="h-5 w-5" />}
          label="LATENCY"
          value={stats.avgLatency}
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Agent Table - 8 cols */}
        <Card className="lg:col-span-8 bg-black/80 border-[var(--wj-toxic)]/30 overflow-hidden">
          <div className="p-4 border-b border-[var(--wj-toxic)]/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[var(--wj-toxic)]" />
              <span className="text-[10px] tracking-[0.3em] text-[var(--wj-toxic)]/70 uppercase">
                TARGET_REGISTRY
              </span>
              <span className="text-[10px] text-[var(--wj-toxic)]/30 ml-2">
                [{agents.length} targets]
              </span>
            </div>
            <Badge className="bg-[var(--wj-toxic)]/10 text-[var(--wj-toxic)] border-[var(--wj-toxic)]/30 text-[10px]">
              <motion.span
                className="w-1.5 h-1.5 rounded-full bg-[var(--wj-toxic)] mr-1.5"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              LIVE
            </Badge>
          </div>
          <ScrollArea className="h-[400px]">
            {agents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <motion.div
                  className="mb-6"
                  animate={{ opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 3, repeat: Infinity }}
                >
                  <Target className="h-16 w-16 text-[var(--wj-toxic)]/30" />
                </motion.div>
                <p className="text-[var(--wj-toxic)]/50 text-sm font-mono">NO TARGETS ACQUIRED</p>
                <p className="text-[var(--wj-toxic)]/30 text-xs mt-2">Enter URL to begin surveillance</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-[var(--wj-toxic)]/10 hover:bg-transparent">
                    <TableHead className="text-[10px] tracking-[0.2em] text-[var(--wj-toxic)]/50 uppercase w-10">#</TableHead>
                    <TableHead className="text-[10px] tracking-[0.2em] text-[var(--wj-toxic)]/50 uppercase">TARGET</TableHead>
                    <TableHead className="text-[10px] tracking-[0.2em] text-[var(--wj-toxic)]/50 uppercase">PROTOCOL</TableHead>
                    <TableHead className="text-[10px] tracking-[0.2em] text-[var(--wj-toxic)]/50 uppercase">STATUS</TableHead>
                    <TableHead className="text-[10px] tracking-[0.2em] text-[var(--wj-toxic)]/50 uppercase text-center">SCORE</TableHead>
                    <TableHead className="text-[10px] tracking-[0.2em] text-[var(--wj-toxic)]/50 uppercase text-center">GRADE</TableHead>
                    <TableHead className="text-[10px] tracking-[0.2em] text-[var(--wj-toxic)]/50 uppercase text-center">LATENCY</TableHead>
                    <TableHead className="text-[10px] tracking-[0.2em] text-[var(--wj-toxic)]/50 uppercase text-center">TOOLS</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agents.map((agent, index) => (
                    <AgentRow key={agent.id} agent={agent} rank={index + 1} onInspect={() => setSelectedAgent(agent)} />
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </Card>

        {/* Right Column - 4 cols */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Threat Radar with Matrix Rain */}
          <Card className="bg-black/80 border-[var(--wj-toxic)]/30 p-6 relative overflow-hidden">
            {/* Matrix Rain Background */}
            <MatrixRain className="rounded-lg" />

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] tracking-[0.3em] text-[var(--wj-toxic)]/70 uppercase">
                  THREAT_RADAR
                </span>
                {isScanning && (
                  <span className="text-[10px] text-[var(--wj-toxic)] animate-pulse">SCANNING...</span>
                )}
              </div>
              <ThreatRadar threats={stats.threatsDetected} isScanning={isScanning} />
              <div className="mt-4 text-center">
                <GlitchText active={stats.threatsDetected > 0}>
                  <span className={cn(
                    "text-2xl font-bold",
                    stats.threatsDetected > 0 ? "text-[var(--wj-danger)] danger-glow" : "text-[var(--wj-toxic)] toxic-glow-subtle"
                  )}>
                    {stats.threatsDetected > 0 ? "HOSTILE" : "CLEAR"}
                  </span>
                </GlitchText>
              </div>
            </div>
          </Card>

          {/* Terminal */}
          <Card className="bg-black border-[var(--wj-toxic)]/30 flex-1 min-h-[380px]">
            <div className="p-3 border-b border-[var(--wj-toxic)]/20 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[var(--wj-danger)]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[var(--wj-warning)]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[var(--wj-toxic)]" />
              </div>
              <Terminal className="h-3 w-3 text-[var(--wj-toxic)]/50 ml-2" />
              <span className="text-[10px] text-[var(--wj-toxic)]/50 tracking-wider">SYSTEM_LOG</span>
            </div>
            <div ref={terminalRef} className="h-[320px] overflow-auto p-3">
              <div className="font-mono text-xs space-y-1">
                <AnimatePresence mode="popLayout">
                  {logs.slice(-100).map((log, i, arr) => {
                    const isLatest = i === arr.length - 1
                    return (
                      <motion.div
                        key={`${log.time}-${i}-${log.message}`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex gap-2"
                      >
                        <span className="text-[var(--wj-toxic)]/40 select-none" suppressHydrationWarning>[{log.time}]</span>
                        <span
                          className={cn(
                            log.type === "ALERT" && "text-[var(--wj-danger)]",
                            log.type === "WARN" && "text-[var(--wj-warning)]",
                            log.type === "INJECT" && "text-[var(--wj-info)]",
                            log.type === "INFO" && "text-[var(--wj-toxic)]",
                            log.type === "SYSTEM" && "text-[var(--wj-toxic)]/60",
                          )}
                        >
                          {isLatest ? <TypingText text={log.message} speed={15} /> : log.message}
                        </span>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
                <span className="inline-block w-2 h-4 bg-[var(--wj-toxic)] terminal-cursor ml-1" />
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Achievements Panel */}
      {unlockedAchievements.size > 0 && (
        <Card className="mt-6 bg-black/80 border-[var(--wj-toxic)]/30 p-4">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="h-4 w-4 text-[var(--wj-toxic)]" />
            <span className="text-[10px] tracking-[0.3em] text-[var(--wj-toxic)]/70 uppercase">
              ACHIEVEMENTS
            </span>
            <span className="text-[10px] text-[var(--wj-toxic)]/30 ml-auto">
              {unlockedAchievements.size}/{ACHIEVEMENTS.length}
            </span>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {ACHIEVEMENTS.map((achievement) => (
              <AchievementBadge
                key={achievement.id}
                achievement={{
                  ...achievement,
                  unlocked: unlockedAchievements.has(achievement.id),
                }}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Active Audit Panel */}
      <AnimatePresence>
        {isScanning && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-2xl w-full px-4"
          >
            <Card className="bg-black/95 border-[var(--wj-info)]/50 px-6 py-4 border-glow">
              {(() => {
                const activeAgent = agents.find((a) => a.status === "QUEUED" || a.status === "PROCESSING")
                const latestToolCall = activeAgent?.toolCalls?.[activeAgent.toolCalls.length - 1]
                const completedSteps = activeAgent?.steps?.filter(s => s.status === 'completed').length || 0

                return (
                  <div className="space-y-4">
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-3">
                        <motion.div
                          className="w-10 h-10 rounded border border-[var(--wj-info)]/50 flex items-center justify-center text-xs font-bold text-[var(--wj-info)]"
                          animate={{ borderColor: ["rgba(96,165,250,0.5)", "rgba(96,165,250,1)", "rgba(96,165,250,0.5)"] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        >
                          {activeAgent?.avatar || "??"}
                        </motion.div>
                        <div>
                          <p className="font-bold text-[var(--wj-toxic)] text-sm">
                            {activeAgent?.name || "—"}
                          </p>
                          <p className="text-[10px] text-[var(--wj-toxic)]/50">
                            {activeAgent?.protocol || "—"} | Phase: {activeAgent?.currentPhase || "QUEUED"}
                          </p>
                        </div>
                      </div>

                      {/* Progress indicator */}
                      <div className="flex-1 flex items-center gap-2">
                        <div className="flex-1 h-1 bg-[var(--wj-toxic)]/10 rounded overflow-hidden">
                          <motion.div
                            className="h-full bg-[var(--wj-info)]"
                            initial={{ width: "0%" }}
                            animate={{ width: `${Math.min(completedSteps * 25, 100)}%` }}
                            transition={{ duration: 0.3 }}
                          />
                        </div>
                        <span className="text-[10px] text-[var(--wj-toxic)]/50 font-mono">
                          {completedSteps}/4
                        </span>
                      </div>

                      {/* Tool calls counter */}
                      <div className="text-center px-3 border-l border-[var(--wj-toxic)]/20">
                        <p className="text-lg font-bold text-[var(--wj-info)] font-mono">
                          {activeAgent?.toolCalls?.length || 0}
                        </p>
                        <p className="text-[8px] text-[var(--wj-toxic)]/50 tracking-wider">TOOLS</p>
                      </div>
                    </div>

                    {/* Current action display */}
                    {latestToolCall && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="border-t border-[var(--wj-toxic)]/10 pt-3"
                      >
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-3 w-3 text-[var(--wj-info)] animate-spin" />
                          <span className="text-[10px] text-[var(--wj-toxic)]/70 uppercase tracking-wider">
                            Current Action:
                          </span>
                          <span className="text-xs text-[var(--wj-info)] font-mono">
                            {latestToolCall.tool}
                          </span>
                        </div>
                        {latestToolCall.input && typeof latestToolCall.input === 'object' && (
                          <p className="text-[10px] text-[var(--wj-toxic)]/50 font-mono mt-1 truncate max-w-md">
                            {JSON.stringify(latestToolCall.input).substring(0, 80)}...
                          </p>
                        )}
                      </motion.div>
                    )}
                  </div>
                )
              })()}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inspect Modal */}
      <Sheet open={!!selectedAgent} onOpenChange={() => setSelectedAgent(null)}>
        <SheetContent className="bg-black border-[var(--wj-toxic)]/30 w-full sm:max-w-xl overflow-y-auto p-0">
          {selectedAgent && (
            <>
              {/* Header with status banner */}
              <div className={cn(
                "p-6 border-b",
                selectedAgent.status === "PASS"
                  ? "bg-[var(--wj-toxic)]/10 border-[var(--wj-toxic)]/30"
                  : "bg-[var(--wj-danger)]/10 border-[var(--wj-danger)]/30"
              )}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-12 h-12 border-2 flex items-center justify-center text-lg font-bold",
                      selectedAgent.status === "PASS"
                        ? "border-[var(--wj-toxic)] text-[var(--wj-toxic)]"
                        : "border-[var(--wj-danger)] text-[var(--wj-danger)]"
                    )}>
                      {selectedAgent.status === "PASS" ? (
                        <CheckCircle2 className="h-6 w-6" />
                      ) : (
                        <Skull className="h-6 w-6" />
                      )}
                    </div>
                    <div>
                      <h2 className={cn(
                        "text-xl font-bold font-mono",
                        selectedAgent.status === "PASS" ? "text-[var(--wj-toxic)]" : "text-[var(--wj-danger)]"
                      )}>
                        {selectedAgent.status === "PASS" ? "SECURE" : "COMPROMISED"}
                      </h2>
                      <p className="text-[var(--wj-toxic)]/60 text-sm font-mono">{selectedAgent.name}</p>
                    </div>
                  </div>
                  <Badge className={cn(
                    "text-lg font-bold font-mono px-3 py-1",
                    selectedAgent.safetyRating === "A" || selectedAgent.safetyRating === "B"
                      ? "bg-[var(--wj-toxic)]/20 text-[var(--wj-toxic)] border-[var(--wj-toxic)]/50"
                      : selectedAgent.safetyRating === "C"
                      ? "bg-[var(--wj-warning)]/20 text-[var(--wj-warning)] border-[var(--wj-warning)]/50"
                      : "bg-[var(--wj-danger)]/20 text-[var(--wj-danger)] border-[var(--wj-danger)]/50"
                  )}>
                    {selectedAgent.safetyRating}
                  </Badge>
                </div>

                {/* Quick Stats Row */}
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="text-center p-2 bg-black/30 border border-[var(--wj-toxic)]/20">
                    <p className={cn(
                      "text-xl font-bold font-mono",
                      selectedAgent.resilienceScore >= 80 ? "text-[var(--wj-toxic)]" :
                      selectedAgent.resilienceScore >= 50 ? "text-[var(--wj-warning)]" :
                      "text-[var(--wj-danger)]"
                    )}>
                      {selectedAgent.resilienceScore}%
                    </p>
                    <p className="text-[8px] text-[var(--wj-toxic)]/50 tracking-wider uppercase">Score</p>
                  </div>
                  <div className="text-center p-2 bg-black/30 border border-[var(--wj-toxic)]/20">
                    <p className="text-xl font-bold font-mono text-[var(--wj-info)]">
                      {selectedAgent.toolCalls?.length || 0}
                    </p>
                    <p className="text-[8px] text-[var(--wj-toxic)]/50 tracking-wider uppercase">Tools</p>
                  </div>
                  <div className="text-center p-2 bg-black/30 border border-[var(--wj-toxic)]/20">
                    <p className="text-xl font-bold font-mono text-[var(--wj-toxic)]">
                      {selectedAgent.latency > 0 ? `${Math.round(selectedAgent.latency / 1000)}s` : "---"}
                    </p>
                    <p className="text-[8px] text-[var(--wj-toxic)]/50 tracking-wider uppercase">Time</p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-5">
                {/* Target Info */}
                <div className="p-3 bg-black/50 border border-[var(--wj-toxic)]/20">
                  <h4 className="text-[10px] tracking-[0.2em] text-[var(--wj-toxic)]/50 uppercase mb-2">Target</h4>
                  <p className="text-xs text-[var(--wj-toxic)] font-mono break-all">{selectedAgent.url}</p>
                  <p className="text-[10px] text-[var(--wj-toxic)]/50 mt-1">Protocol: {selectedAgent.protocol}</p>
                </div>

                {/* Screenshot */}
                {selectedAgent.screenshot && (
                  <div className="border border-[var(--wj-toxic)]/20 overflow-hidden">
                    <div className="p-2 bg-[var(--wj-toxic)]/5 border-b border-[var(--wj-toxic)]/20">
                      <span className="text-[10px] tracking-[0.2em] text-[var(--wj-toxic)]/50 uppercase flex items-center gap-2">
                        <Eye className="h-3 w-3" /> Screenshot
                      </span>
                    </div>
                    <img
                      src={`data:image/png;base64,${selectedAgent.screenshot}`}
                      alt="Audit Screenshot"
                      className="w-full"
                    />
                  </div>
                )}

                {/* Vulnerabilities */}
                {selectedAgent.vulnerabilities && selectedAgent.vulnerabilities.length > 0 && (
                  <div className="p-4 bg-[var(--wj-danger)]/5 border border-[var(--wj-danger)]/30">
                    <h4 className="text-[10px] tracking-[0.2em] text-[var(--wj-danger)] uppercase mb-3 flex items-center gap-2">
                      <AlertTriangle className="h-3 w-3" />
                      Vulnerabilities Found ({selectedAgent.vulnerabilities.length})
                    </h4>
                    <ul className="space-y-2">
                      {selectedAgent.vulnerabilities.map((v, i) => {
                        const severity = getVulnerabilitySeverity(v)
                        const displayText = vulnerabilityToString(v)
                        return (
                          <li key={i} className="flex items-start gap-2 text-sm font-mono">
                            <span className="text-[var(--wj-danger)]/50 text-xs">{(i + 1).toString().padStart(2, '0')}</span>
                            {typeof v !== "string" && (
                              <Badge className={cn(
                                "text-[8px] shrink-0",
                                severity === "CRITICAL" && "bg-[var(--wj-danger)]/30 text-[var(--wj-danger)] border-[var(--wj-danger)]/50",
                                severity === "HIGH" && "bg-[var(--wj-danger)]/20 text-[var(--wj-danger)]/80 border-[var(--wj-danger)]/30",
                                severity === "MEDIUM" && "bg-[var(--wj-warning)]/20 text-[var(--wj-warning)] border-[var(--wj-warning)]/30",
                                severity === "LOW" && "bg-[var(--wj-toxic)]/20 text-[var(--wj-toxic)] border-[var(--wj-toxic)]/30",
                              )}>
                                {severity}
                              </Badge>
                            )}
                            <span className="text-[var(--wj-danger)]/90">{typeof v === "string" ? v : v.title}</span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}

                {/* Analysis */}
                {selectedAgent.failureReason && (
                  <div className="p-4 bg-black/50 border border-[var(--wj-toxic)]/20">
                    <h4 className="text-[10px] tracking-[0.2em] text-[var(--wj-toxic)]/50 uppercase mb-2">Analysis</h4>
                    <p className="text-sm text-[var(--wj-toxic)]/80 font-mono leading-relaxed">
                      {selectedAgent.failureReason}
                    </p>
                  </div>
                )}

                {/* Agent Actions */}
                {selectedAgent.toolCalls && selectedAgent.toolCalls.length > 0 && (
                  <div className="border border-[var(--wj-toxic)]/20 bg-black/50">
                    <div className="p-3 border-b border-[var(--wj-toxic)]/20 flex items-center justify-between">
                      <h4 className="text-[10px] tracking-[0.2em] text-[var(--wj-toxic)]/50 uppercase flex items-center gap-2">
                        <Bot className="h-3 w-3" />
                        Agent Actions
                      </h4>
                      <span className="text-[10px] text-[var(--wj-info)] font-mono">{selectedAgent.toolCalls.length} calls</span>
                    </div>
                    <ScrollArea className="h-40">
                      <div className="p-3 space-y-1">
                        {selectedAgent.toolCalls.map((tc, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-[var(--wj-toxic)]/5 last:border-0">
                            <span className="text-[var(--wj-toxic)]/30 font-mono w-5">{(i + 1).toString().padStart(2, '0')}</span>
                            <span className="text-[var(--wj-info)] font-mono">{tc.tool}</span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}

                {/* Execution Steps */}
                {selectedAgent.steps && selectedAgent.steps.length > 0 && (
                  <div className="border border-[var(--wj-toxic)]/20 bg-black/50">
                    <div className="p-3 border-b border-[var(--wj-toxic)]/20">
                      <h4 className="text-[10px] tracking-[0.2em] text-[var(--wj-toxic)]/50 uppercase flex items-center gap-2">
                        <Activity className="h-3 w-3" />
                        Execution Steps
                      </h4>
                    </div>
                    <div className="p-3 space-y-2">
                      {selectedAgent.steps.map((step, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <div className={cn(
                            "w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold",
                            step.status === 'completed' && "bg-[var(--wj-toxic)]/20 text-[var(--wj-toxic)]",
                            step.status === 'running' && "bg-[var(--wj-info)]/20 text-[var(--wj-info)]",
                            step.status === 'failed' && "bg-[var(--wj-danger)]/20 text-[var(--wj-danger)]",
                            step.status === 'pending' && "bg-[var(--wj-toxic)]/10 text-[var(--wj-toxic)]/30"
                          )}>
                            {step.status === 'completed' ? '✓' : step.status === 'running' ? '▶' : step.status === 'failed' ? '✗' : '○'}
                          </div>
                          <span className={cn(
                            "font-mono flex-1",
                            step.status === 'completed' && "text-[var(--wj-toxic)]",
                            step.status === 'running' && "text-[var(--wj-info)]",
                            step.status === 'failed' && "text-[var(--wj-danger)]",
                            step.status === 'pending' && "text-[var(--wj-toxic)]/30"
                          )}>
                            {step.action}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Export Button */}
                <Button
                  className="w-full bg-[var(--wj-toxic)] text-black hover:bg-[var(--wj-toxic)]/80 font-bold h-12 tracking-wider"
                  onClick={() => exportAuditReport(selectedAgent)}
                >
                  <Download className="h-4 w-4 mr-2" />
                  EXPORT REPORT
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

// Sub-components
function StatCard({
  icon,
  label,
  value,
  variant = "default",
}: { icon: React.ReactNode; label: string; value: string | number; variant?: "default" | "danger" }) {
  return (
    <Card className={cn(
      "bg-black/80 border p-4 flex items-center gap-4",
      variant === "danger" && Number(value) > 0
        ? "border-[var(--wj-danger)]/50 border-glow-danger"
        : "border-[var(--wj-toxic)]/30"
    )}>
      <div className={cn(
        "p-2.5 border",
        variant === "danger" && Number(value) > 0
          ? "border-[var(--wj-danger)]/50 text-[var(--wj-danger)]"
          : "border-[var(--wj-toxic)]/30 text-[var(--wj-toxic)]"
      )}>
        {icon}
      </div>
      <div>
        <p className="text-[10px] tracking-[0.3em] text-[var(--wj-toxic)]/50 uppercase">{label}</p>
        <p className={cn(
          "text-2xl font-bold font-mono",
          variant === "danger" && Number(value) > 0 ? "text-[var(--wj-danger)]" : "text-[var(--wj-toxic)]"
        )}>
          {value}
        </p>
      </div>
    </Card>
  )
}

function AgentRow({ agent, rank, onInspect }: { agent: Agent; rank: number; onInspect: () => void }) {
  const toolCount = agent.toolCalls?.length || 0
  const isActive = agent.status === "PROCESSING" || agent.status === "QUEUED"

  // Format latency display
  const formatLatency = (ms: number) => {
    if (ms === 0) return "---"
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  return (
    <TableRow className={cn(
      "border-[var(--wj-toxic)]/10 group transition-colors",
      agent.status === "FAIL" && "bg-[var(--wj-danger)]/5",
      agent.status === "PASS" && "bg-[var(--wj-toxic)]/5",
      isActive && "bg-[var(--wj-info)]/5"
    )}>
      {/* Rank */}
      <TableCell className="font-mono text-[var(--wj-toxic)]/50 text-xs">
        {rank.toString().padStart(2, "0")}
      </TableCell>

      {/* Target Name + URL */}
      <TableCell>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-7 h-7 border flex items-center justify-center text-[9px] font-bold shrink-0",
              agent.status === "PASS" && "border-[var(--wj-toxic)]/50 text-[var(--wj-toxic)]",
              agent.status === "FAIL" && "border-[var(--wj-danger)]/50 text-[var(--wj-danger)]",
              agent.status === "PROCESSING" && "border-[var(--wj-info)]/50 text-[var(--wj-info)]",
              agent.status === "QUEUED" && "border-[var(--wj-toxic)]/20 text-[var(--wj-toxic)]/50",
            )}>
              {agent.avatar}
            </div>
            <span className="font-mono text-sm text-[var(--wj-toxic)] truncate max-w-[120px]">{agent.name}</span>
          </div>
          {agent.url && (
            <span className="text-[9px] text-[var(--wj-toxic)]/30 font-mono truncate max-w-[150px] ml-9" title={agent.url}>
              {agent.url.replace(/^https?:\/\//, '').substring(0, 25)}...
            </span>
          )}
        </div>
      </TableCell>

      {/* Protocol */}
      <TableCell>
        <Badge className={cn(
          "text-[8px] font-mono tracking-wide border px-1.5 py-0.5",
          agent.protocol?.includes("STRESS") && "border-[var(--wj-toxic)]/30 bg-[var(--wj-toxic)]/10 text-[var(--wj-toxic)]",
          agent.protocol?.includes("FINANCE") && "border-[var(--wj-warning)]/30 bg-[var(--wj-warning)]/10 text-[var(--wj-warning)]",
          agent.protocol?.includes("HIPAA") && "border-[var(--wj-danger)]/30 bg-[var(--wj-danger)]/10 text-[var(--wj-danger)]",
          agent.protocol?.includes("CONTRACT") && "border-[var(--wj-info)]/30 bg-[var(--wj-info)]/10 text-[var(--wj-info)]",
          !agent.protocol && "border-[var(--wj-toxic)]/20 bg-transparent text-[var(--wj-toxic)]/30"
        )}>
          {agent.protocol || "N/A"}
        </Badge>
      </TableCell>

      {/* Status */}
      <TableCell>
        <StatusBadge status={agent.status} />
      </TableCell>

      {/* Score */}
      <TableCell className="text-center">
        <div className="flex flex-col items-center">
          <span className={cn(
            "font-mono text-sm font-bold",
            isActive ? "text-[var(--wj-toxic)]/30" :
            agent.resilienceScore >= 80 ? "text-[var(--wj-toxic)]" :
            agent.resilienceScore >= 50 ? "text-[var(--wj-warning)]" :
            "text-[var(--wj-danger)]"
          )}>
            {isActive ? "---" : `${agent.resilienceScore}%`}
          </span>
          {!isActive && (
            <div className="w-12 h-1 bg-[var(--wj-toxic)]/10 rounded-full mt-1 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  agent.resilienceScore >= 80 ? "bg-[var(--wj-toxic)]" :
                  agent.resilienceScore >= 50 ? "bg-[var(--wj-warning)]" :
                  "bg-[var(--wj-danger)]"
                )}
                style={{ width: `${agent.resilienceScore}%` }}
              />
            </div>
          )}
        </div>
      </TableCell>

      {/* Grade */}
      <TableCell className="text-center">
        <span className={cn(
          "inline-flex items-center justify-center w-7 h-7 border text-xs font-bold font-mono",
          agent.safetyRating === "A" && "border-[var(--wj-toxic)]/50 text-[var(--wj-toxic)]",
          agent.safetyRating === "B" && "border-[var(--wj-toxic)]/50 text-[var(--wj-toxic)]",
          agent.safetyRating === "C" && "border-[var(--wj-warning)]/50 text-[var(--wj-warning)]",
          agent.safetyRating === "D" && "border-[var(--wj-danger)]/50 text-[var(--wj-danger)]",
          agent.safetyRating === "F" && "border-[var(--wj-danger)]/50 text-[var(--wj-danger)]",
          agent.safetyRating === "-" && "border-[var(--wj-toxic)]/20 text-[var(--wj-toxic)]/30",
        )}>
          {agent.safetyRating}
        </span>
      </TableCell>

      {/* Latency */}
      <TableCell className="text-center">
        <span className={cn(
          "font-mono text-xs",
          isActive ? "text-[var(--wj-toxic)]/30" :
          agent.latency < 5000 ? "text-[var(--wj-toxic)]" :
          agent.latency < 15000 ? "text-[var(--wj-warning)]" :
          "text-[var(--wj-danger)]"
        )}>
          {isActive ? (
            <Loader2 className="h-3 w-3 animate-spin mx-auto text-[var(--wj-info)]" />
          ) : (
            formatLatency(agent.latency)
          )}
        </span>
      </TableCell>

      {/* Tools */}
      <TableCell className="text-center">
        <div className="flex items-center justify-center gap-1">
          <Bot className={cn(
            "h-3 w-3",
            toolCount > 0 ? "text-[var(--wj-info)]" : "text-[var(--wj-toxic)]/20"
          )} />
          <span className={cn(
            "font-mono text-xs font-bold",
            toolCount > 0 ? "text-[var(--wj-info)]" : "text-[var(--wj-toxic)]/30"
          )}>
            {toolCount}
          </span>
        </div>
      </TableCell>

      {/* Actions */}
      <TableCell>
        {(agent.status === "FAIL" || agent.status === "PASS") && (
          <Button
            variant="ghost"
            size="sm"
            className="text-[var(--wj-toxic)]/50 hover:text-[var(--wj-toxic)] hover:bg-[var(--wj-toxic)]/10 h-7 w-7 p-0"
            onClick={onInspect}
          >
            <Eye className="h-4 w-4" />
          </Button>
        )}
      </TableCell>
    </TableRow>
  )
}

function StatusBadge({ status }: { status: AgentStatus }) {
  return (
    <Badge
      className={cn(
        "text-[10px] font-mono tracking-wider border",
        status === "PASS" && "border-[var(--wj-toxic)]/50 bg-[var(--wj-toxic)]/10 text-[var(--wj-toxic)]",
        status === "FAIL" && "border-[var(--wj-danger)]/50 bg-[var(--wj-danger)]/10 text-[var(--wj-danger)]",
        status === "PROCESSING" && "border-[var(--wj-info)]/50 bg-[var(--wj-info)]/10 text-[var(--wj-info)]",
        status === "QUEUED" && "border-[var(--wj-toxic)]/20 bg-transparent text-[var(--wj-toxic)]/50",
      )}
    >
      {status === "PASS" && <CheckCircle2 className="h-3 w-3 mr-1" />}
      {status === "FAIL" && <XCircle className="h-3 w-3 mr-1" />}
      {status === "PROCESSING" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
      {status === "QUEUED" && (
        <motion.div
          className="w-1.5 h-1.5 rounded-full bg-current mr-1.5"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
      {status}
    </Badge>
  )
}

// Helper functions
function extractAgentName(url: string): string {
  try {
    const hostname = new URL(url).hostname
    const parts = hostname.split(".")
    const name = parts[0].replace(/-/g, "_")
    return name.toUpperCase()
  } catch {
    return "UNKNOWN"
  }
}

function generateAvatar(url: string): string {
  try {
    const hostname = new URL(url).hostname
    const parts = hostname.split(".")[0].split("-")
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return hostname.substring(0, 2).toUpperCase()
  } catch {
    return "??"
  }
}
