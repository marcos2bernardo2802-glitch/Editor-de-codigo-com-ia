import { CodeTemplate } from '../types';

export const CODE_TEMPLATES: CodeTemplate[] = [
  {
    name: 'Botão & Card Interativo (HTML)',
    language: 'html',
    description: 'Componente HTML5 com estilo moderno e script de clique',
    code: `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Card de Produto</title>
  <style>
    body {
      font-family: system-ui, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: #0f172a;
      color: #f8fafc;
    }
    .card {
      background: #1e293b;
      padding: 24px;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
      max-width: 320px;
      text-align: center;
    }
    .btn-buy {
      background: #3b82f6;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      transition: transform 0.1s, background 0.2s;
    }
    .btn-buy:hover {
      background: #2563eb;
      transform: scale(1.02);
    }
  </style>
</head>
<body>
  <div class="card">
    <h2>Fone Sem Fio Pro</h2>
    <p>Áudio espacial imersivo e cancelamento ativo de ruído.</p>
    <button class="btn-buy" id="btnBuy">Comprar Agora - R$ 299</button>
  </div>
  <script>
    document.getElementById('btnBuy').addEventListener('click', () => {
      alert('Produto adicionado ao carrinho!');
    });
  </script>
</body>
</html>`
  },
  {
    name: 'Contador com Estado (JavaScript)',
    language: 'javascript',
    description: 'Função de gerenciamento de estado e evento',
    code: `// Contador com histórico de eventos
class Counter {
  constructor(initialValue = 0) {
    this.value = initialValue;
    this.history = [initialValue];
  }

  increment(step = 1) {
    this.value += step;
    this.history.push(this.value);
    return this.value;
  }

  decrement(step = 1) {
    this.value -= step;
    this.history.push(this.value);
    return this.value;
  }

  reset() {
    this.value = 0;
    this.history = [0];
  }

  getStats() {
    return {
      current: this.value,
      totalOperations: this.history.length - 1,
      max: Math.max(...this.history),
      min: Math.min(...this.history)
    };
  }
}

const myCounter = new Counter(10);
myCounter.increment(5);
myCounter.decrement(2);
console.log(myCounter.getStats());`
  },
  {
    name: 'Script de Análise de Dados (Python)',
    language: 'python',
    description: 'Processamento e filtragem de métricas',
    code: `import json
from datetime import datetime

def analyze_user_activity(logs):
  """Calcula tempo de retenção e contagem de eventos por usuário."""
  summary = {}
  
  for log in logs:
    user_id = log.get("user_id")
    event_type = log.get("event")
    
    if user_id not in summary:
      summary[user_id] = {
        "event_count": 0,
        "last_seen": log.get("timestamp"),
        "events": []
      }
      
    summary[user_id]["event_count"] += 1
    summary[user_id]["events"].append(event_type)
    
  return summary

# Exemplo de teste
logs_data = [
  {"user_id": "usr_1", "event": "login", "timestamp": "2026-03-01T10:00:00Z"},
  {"user_id": "usr_2", "event": "login", "timestamp": "2026-03-01T10:05:00Z"},
  {"user_id": "usr_1", "event": "checkout", "timestamp": "2026-03-01T10:15:00Z"},
]

result = analyze_user_activity(logs_data)
print(json.dumps(result, indent=2))`
  }
];
