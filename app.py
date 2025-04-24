# -*- coding: utf-8 -*-

# 1. Importações
from flask import Flask, request, jsonify, render_template
import datetime
# from collections import deque # Não usaremos mais deque diretamente para persistência
import json # Ainda pode ser útil para JSON, mas não para o arquivo
import os
import traceback
import uuid
from google.cloud import firestore # <-- ADICIONADO: Cliente Firestore

# --- 2. Inicialização da Aplicação Flask ---
app = Flask(__name__)

# --- 3. Configurações e Variáveis Globais ---
# MAX_NOTIFICATIONS = 100 # O limite será gerenciado de outra forma ou removido
# NOTIFICATIONS_FILE = os.path.join(os.path.dirname(__file__), 'notifications.json') # Não mais necessário
CHECK_DUPLICATE_COUNT = 5 # Manter a lógica de verificação de duplicatas recentes

# --- Inicialização do Cliente Firestore ---
try:
    db = firestore.Client()
    # Coleção onde as notificações serão armazenadas. Use um nome descritivo.
    notifications_collection = db.collection('monitor_notifications')
    print("Cliente Firestore inicializado com sucesso.")
except Exception as e:
    print(f"ERRO CRÍTICO: Não foi possível inicializar o cliente Firestore: {e}")
    print("Verifique as credenciais (Application Default Credentials) e se a API Firestore está habilitada.")
    # Em um cenário real, você pode querer impedir a inicialização do app aqui
    db = None
    notifications_collection = None

# --- 4. Funções Auxiliares (Adaptadas para Firestore) ---
# load_notifications() e save_notifications() não são mais necessárias da mesma forma,
# pois o Firestore é a fonte da verdade.

# --- 5. Definição das Rotas (@app.route) ---
@app.route('/')
def index():
    """Serve a página HTML principal."""
    return render_template('index.html')

@app.route('/notifications', methods=['GET'])
def get_notifications():
    """Retorna a lista atual de notificações do Firestore em formato JSON."""
    if not notifications_collection:
         return jsonify({"error": "Firestore não inicializado"}), 500
    try:
        # Ordena por timestamp descendente para pegar as mais recentes
        # Limita a quantidade (opcional, mas bom para performance)
        query = notifications_collection.order_by(
            'timestamp', direction=firestore.Query.DESCENDING).limit(100) # Exemplo de limite
        docs = query.stream()
        notifications_list = [doc.to_dict() for doc in docs]
        return jsonify(notifications_list)
    except Exception as e:
        print(f"Erro ao buscar notificações do Firestore: {e}"); traceback.print_exc()
        return jsonify({"status": "error", "message": f"Erro ao buscar notificações: {str(e)}"}), 500

@app.route('/api/notification', methods=['POST'])
def receive_notification():
    """Endpoint para receber notificações via Form Data, com verificação de duplicatas."""
    if not notifications_collection:
         return jsonify({"error": "Firestore não inicializado"}), 500

    raw_form_data = {}
    try:
        print(f"\n--- Nova Requisição POST /api/notification ---")
        print(f"Recebido cabeçalho Content-Type: {request.content_type}")

        # ... (validação do content-type e obtenção dos dados do form - igual ao original) ...
        app_name = request.form.get("appName")
        title = request.form.get("title")
        text = request.form.get("text")
        macro_name = request.form.get("macro")
        raw_form_data = request.form.to_dict()
        print(f"Dados recebidos do formulário (request.form): {raw_form_data}")

        if not app_name or not str(app_name).strip():
             print(f"Erro 400: Nome do aplicativo faltando ou vazio.")
             return jsonify({"status": "error", "message": "Nome do aplicativo obrigatório."}), 400

        content_parts = []
        if title: content_parts.append(str(title).strip())
        if text: content_parts.append(str(text).strip())
        internal_content = " | ".join(filter(None, content_parts)) if content_parts else "Sem conteúdo"

        # Usar timestamp do Firestore para consistência ou manter o do Python
        # timestamp_obj = datetime.datetime.now(datetime.timezone.utc) # Recomendado usar UTC
        timestamp_obj = datetime.datetime.now() # Ou manter o local se preferir
        timestamp_str = timestamp_obj.strftime("%Y-%m-%d %H:%M:%S") # Para exibição se necessário

        notification_id = str(uuid.uuid4()) # Usar como ID do documento no Firestore

        notification_data = {
            "id": notification_id, # Armazenar o ID dentro do documento também é útil
            "app": str(app_name).strip(),
            "content": internal_content,
            "keyword": str(macro_name).strip() if macro_name else None,
            "timestamp": timestamp_obj # Armazenar como objeto Timestamp do Firestore
            # "timestamp_str": timestamp_str # Opcional: se precisar da string formatada
        }

        # --- Verificação de Duplicatas (Consultando o Firestore) ---
        is_duplicate = False
        try:
            # Busca as últimas N notificações para o mesmo app com o mesmo conteúdo
            query = notifications_collection.where('app', '==', notification_data['app']) \
                                            .where('content', '==', notification_data['content']) \
                                            .order_by('timestamp', direction=firestore.Query.DESCENDING) \
                                            .limit(CHECK_DUPLICATE_COUNT) # Verifica N recentes
            recent_duplicates = query.stream()

            # Verifica se alguma das recentes é "muito" recente (ex: últimos 60 segundos)
            # Ou simplesmente se existe alguma igual nas últimas N verificadas
            if any(recent_duplicates): # Simplificado: se encontrou alguma igual nas últimas N
                is_duplicate = True
                print(f"Notificação duplicada detectada (baseado nas últimas {CHECK_DUPLICATE_COUNT}). Ignorando.")

        except Exception as e:
             print(f"Aviso: Erro ao verificar duplicatas no Firestore: {e}. Continuando sem verificação...")
             # Decida se quer prosseguir ou retornar erro em caso de falha na verificação

        if not is_duplicate:
            # Adiciona a notificação ao Firestore usando o ID gerado
            doc_ref = notifications_collection.document(notification_id)
            doc_ref.set(notification_data)

            print(f"Notificação adicionada ao Firestore (ID: {notification_id}): App='{notification_data['app']}'.")
            print("--- Fim da Requisição POST ---")
            # Opcional: Implementar lógica para remover notificações antigas se precisar limitar o total
            # (ex: buscar notificações além de um limite e deletá-las)
            return jsonify({"status": "success", "message": "Notificação recebida e processada", "id": notification_id}), 200
        else:
            print(f"Notificação de App='{notification_data['app']}' ignorada como duplicata.")
            print("--- Fim da Requisição POST (Duplicata Ignorada) ---")
            return jsonify({"status": "success", "message": "Notificação duplicada ignorada"}), 200

    except Exception as e:
        print(f"Erro 500: Erro inesperado GERAL ao processar notificação: {e}")
        print(f"Dados do formulário que podem ter causado erro: {raw_form_data}")
        traceback.print_exc()
        print("--- Fim da Requisição POST (com erro GERAL) ---")
        return jsonify({"status": "error", "message": f"Erro interno do servidor: {str(e)}"}), 500

@app.route('/api/notification/<notification_id>', methods=['DELETE'])
def delete_notification(notification_id):
    """Endpoint para deletar uma notificação específica pelo seu ID no Firestore."""
    if not notifications_collection:
         return jsonify({"error": "Firestore não inicializado"}), 500
    print(f"\n--- Requisição DELETE /api/notification/{notification_id} ---")
    try:
        doc_ref = notifications_collection.document(notification_id)
        doc = doc_ref.get()

        if doc.exists:
            doc_ref.delete()
            print(f"Notificação ID {notification_id} removida do Firestore com sucesso.")
            return jsonify({"status": "success", "message": "Notificação removida"}), 200
        else:
            print(f"Erro 404: Notificação ID {notification_id} não encontrada no Firestore para exclusão.")
            return jsonify({"status": "error", "message": "Notificação não encontrada"}), 404
    except Exception as e:
        print(f"Erro 500 ao tentar remover notificação ID {notification_id} do Firestore: {e}")
        traceback.print_exc()
        return jsonify({"status": "error", "message": f"Erro interno ao remover notificação: {str(e)}"}), 500

@app.route('/clear', methods=['POST'])
def clear_all_notifications():
    """Limpa todas as notificações na coleção do Firestore (Use com CUIDADO!)."""
    if not notifications_collection:
         return jsonify({"error": "Firestore não inicializado"}), 500
    print("\n--- Requisição POST /clear ---")
    try:
        # ATENÇÃO: Deletar coleções inteiras eficientemente pode ser complexo.
        # Uma abordagem é buscar todos os documentos e deletar em batch.
        # Para poucas notificações, deletar um por um pode funcionar.
        # Para muitas, considere uma Cloud Function ou script separado.
        deleted_count = 0
        batch = db.batch()
        docs = notifications_collection.limit(500).stream() # Limite por batch
        for doc in docs:
            batch.delete(doc.reference)
            deleted_count += 1

        if deleted_count > 0:
             batch.commit()
             print(f"{deleted_count} notificações removidas do Firestore (pode haver mais se > 500).")
             # Adicione lógica para repetir se necessário
             return jsonify({"status": "success", "message": f"{deleted_count} notificações limpas (ou o primeiro lote)"}), 200
        else:
             print("Nenhuma notificação encontrada para limpar.")
             return jsonify({"status": "success", "message": "Nenhuma notificação para limpar"}), 200

    except Exception as e:
        print(f"Erro ao limpar notificações do Firestore: {e}"); traceback.print_exc()
        return jsonify({"status": "error", "message": f"Erro ao limpar notificações: {str(e)}"}), 500

# --- 6. Bloco Principal de Execução ---
if __name__ == '__main__':
    # load_notifications() não é mais necessário aqui
    print("\n=========================================")
    print(" Iniciando servidor Flask (para desenvolvimento local)...")
    print(f"(Verificando duplicatas nas últimas {CHECK_DUPLICATE_COUNT} notificações via Firestore)")
    print(" Usando Firestore para persistência.")
    print("=========================================")
    # Para desenvolvimento local, use o servidor Flask.
    # Para produção no Cloud Run, usaremos Gunicorn (veja Dockerfile/Procfile).
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)), debug=False) # Use a porta definida pelo Cloud Run
