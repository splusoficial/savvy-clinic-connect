import React, { useEffect, useState } from "react";

const FUNCTION_URL = "https://yattgeryizsliduybfxn.supabase.co/functions/v1/generate-link";

const ApiGenerateLink: React.FC = () => {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const email = params.get("email");

    if (!email) {
      setError('Parâmetro "email" é obrigatório.');
      return;
    }

    // Garantir redirect_to para evitar erros comuns de redirecionamento
    if (!params.get("redirect_to")) {
      params.set("redirect_to", `${window.location.origin}/`);
    }

    // Forçar resposta em JSON para podermos redirecionar direto sem expor a URL da função
    params.set("mode", "json");

    const url = `${FUNCTION_URL}?${params.toString()}`;

    const run = async () => {
      try {
        const res = await fetch(url);
        const json = await res.json();
        if (!res.ok || !json?.action_link) {
          throw new Error(json?.error || "Falha ao gerar magic link");
        }
        // Redireciona direto para o magic link
        window.location.href = json.action_link as string;
      } catch (e: any) {
        setError(e?.message || "Falha ao gerar magic link");
      }
    };

    run();
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      {!error ? (
        <div className="flex items-center justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-muted-foreground/30 border-t-primary animate-spin" aria-label="Carregando" />
          <span className="sr-only">Carregando…</span>
        </div>
      ) : (
        <main className="max-w-lg text-center space-y-2">
          <p className="text-destructive">{error}</p>
          <p className="text-muted-foreground">
            Exemplo: /api/generate-link?email=seuemail@exemplo.com&name=Seu+Nome&wh_id=1804&inst=sua_inst
          </p>
        </main>
      )}
    </div>
  );
};

export default ApiGenerateLink;
