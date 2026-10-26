'use client'

// Pantalla de acceso — primer uso (crear contraseña) o inicio de sesión
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Lock, ShieldCheck } from 'lucide-react'
import { api } from './types'
import { toast } from 'sonner'

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
        <MailGlyph />
      </div>
      <div className="leading-tight">
        <p className={`text-[15px] font-bold tracking-tight ${light ? 'text-white' : 'text-foreground'}`}>
          Alice<span className="text-primary">Mail</span>
        </p>
        {!light && <p className="text-[10px] text-muted-foreground">Plataforma de correo en frío</p>}
      </div>
    </div>
  )
}

function MailGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5v-9Z" stroke="white" strokeWidth="2" />
      <path d="m4 7 8 6 8-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function LoginScreen({ hasPassword, onAuth }: { hasPassword: boolean; onAuth: () => void }) {
  const [mode, setMode] = useState<'setup' | 'login'>(hasPassword ? 'login' : 'setup')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'setup' && password !== confirm) {
      toast.error('Las contraseñas no coinciden')
      return
    }
    setLoading(true)
    try {
      if (mode === 'setup') {
        await api('/api/auth/setup', { method: 'POST', body: JSON.stringify({ password }) })
        toast.success('Contraseña creada — bienvenido')
      } else {
        await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) })
      }
      onAuth()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error de acceso')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary shadow-sm">
            <MailGlyph />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">AliceMail</h1>
            <p className="text-xs text-muted-foreground">Plataforma de correo en frío · AliceLabs</p>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm">
          {mode === 'setup' ? (
            <>
              <h2 className="text-base font-semibold">Crea tu contraseña de administrador</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Primera puesta en marcha. Solo tú tendrá acceso: todos los datos sensibles se cifran con AES-256.
              </p>
              <form onSubmit={submit} className="mt-5 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="pw">Contraseña</Label>
                  <Input
                    id="pw"
                    type="password"
                    minLength={8}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pw2">Confirmar contraseña</Label>
                  <Input
                    id="pw2"
                    type="password"
                    minLength={8}
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repite la contraseña"
                  />
                </div>
                <Button type="submit" disabled={loading || password.length < 8} className="w-full">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear acceso'}
                </Button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-base font-semibold">Iniciar sesión</h2>
              <p className="mt-1 text-xs text-muted-foreground">Introduce tu contraseña de administrador.</p>
              <form onSubmit={submit} className="mt-5 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="pw">Contraseña</Label>
                  <Input
                    id="pw"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Tu contraseña"
                    autoFocus
                  />
                </div>
                <Button type="submit" disabled={loading || !password} className="w-full">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Lock className="h-4 w-4" /> Entrar</>}
                </Button>
              </form>
            </>
          )}
        </div>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          Sesión cifrada · contraseñas con AES-256-GCM en reposo
        </p>
      </div>
    </div>
  )
}
