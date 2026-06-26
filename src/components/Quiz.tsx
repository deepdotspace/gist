import { useState } from 'react'
import { Check, X, RotateCcw, Sparkles, Loader2 } from 'lucide-react'
import { Button } from './ui'
import { cn } from './ui/utils'
import type { QuizQuestion } from '../lib/gist-pipeline'

interface QuizProps {
  questions: QuizQuestion[] | null
  generating: boolean
  genError: string | null
  onGenerate: () => void
}

export function Quiz({ questions, generating, genError, onGenerate }: QuizProps) {
  if (generating) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card px-6 py-16 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Writing your quiz…</p>
      </div>
    )
  }

  if (!questions || questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Sparkles className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-base font-semibold">Test yourself</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Generate a quick 5-question quiz from this video to check what stuck.
          </p>
        </div>
        {genError && <p className="text-sm text-destructive">{genError}</p>}
        <Button onClick={onGenerate}>
          <Sparkles className="h-4 w-4" />
          Generate quiz
        </Button>
      </div>
    )
  }

  return <QuizRunner questions={questions} />
}

function QuizRunner({ questions }: { questions: QuizQuestion[] }) {
  const [current, setCurrent] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [answers, setAnswers] = useState<number[]>([])
  const [finished, setFinished] = useState(false)

  const q = questions[current]
  const isLast = current === questions.length - 1

  const score = answers.reduce(
    (acc, a, i) => acc + (a === questions[i].answerIndex ? 1 : 0),
    0,
  )

  function choose(i: number) {
    if (picked != null) return
    setPicked(i)
  }

  function next() {
    if (picked == null) return
    const nextAnswers = [...answers, picked]
    setAnswers(nextAnswers)
    setPicked(null)
    if (isLast) setFinished(true)
    else setCurrent((c) => c + 1)
  }

  function restart() {
    setCurrent(0)
    setPicked(null)
    setAnswers([])
    setFinished(false)
  }

  if (finished) {
    const pct = Math.round((score / questions.length) * 100)
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-sm font-medium text-muted-foreground">You scored</p>
        <p className="mt-1 text-5xl font-bold tracking-tight text-foreground">
          {score}
          <span className="text-2xl text-muted-foreground">/{questions.length}</span>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {pct >= 80 ? 'You really got the gist. 🎯' : pct >= 50 ? 'Solid — worth a skim of the notes.' : 'Might be worth a rewatch of the key chapters.'}
        </p>
        <Button variant="outline" className="mt-6" onClick={restart}>
          <RotateCcw className="h-4 w-4" />
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Question {current + 1} of {questions.length}
        </span>
        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${((current + (picked != null ? 1 : 0)) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      <h3 className="text-lg font-semibold leading-snug text-foreground">{q.question}</h3>

      <div className="mt-4 space-y-2">
        {q.options.map((opt, i) => {
          const isCorrect = i === q.answerIndex
          const isPicked = i === picked
          const revealed = picked != null
          return (
            <button
              key={i}
              onClick={() => choose(i)}
              disabled={revealed}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors',
                !revealed && 'border-border hover:border-primary/50 hover:bg-secondary/50',
                revealed && isCorrect && 'border-success/40 bg-success/10 text-foreground',
                revealed && isPicked && !isCorrect && 'border-destructive/40 bg-destructive/10 text-foreground',
                revealed && !isCorrect && !isPicked && 'border-border opacity-60',
              )}
            >
              <span>{opt}</span>
              {revealed && isCorrect && <Check className="h-4 w-4 shrink-0 text-success" />}
              {revealed && isPicked && !isCorrect && <X className="h-4 w-4 shrink-0 text-destructive" />}
            </button>
          )
        })}
      </div>

      {picked != null && q.explanation && (
        <p className="mt-4 rounded-lg bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">
          {q.explanation}
        </p>
      )}

      <div className="mt-5 flex justify-end">
        <Button onClick={next} disabled={picked == null}>
          {isLast ? 'See results' : 'Next question'}
        </Button>
      </div>
    </div>
  )
}
