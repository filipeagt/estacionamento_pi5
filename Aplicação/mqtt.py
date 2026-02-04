import django
import os
import paho.mqtt.client as mqtt

# Configuração do Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "estacionamento.settings")
django.setup()

from vagas.models import *
from vagas.sensores import listaSensores

# Configuração do MQTT
MQTT_BROKER = "test.mosquitto.org"
MQTT_PORT = 1883
TOPIC = "pi5/estacionamento/vaga/#"

def on_connect(client, userdata, flags, rc):
    print(f"Conectado ao MQTT com código {rc}")
    client.subscribe(TOPIC)
    print(f"Inscrito no tópico {TOPIC}")

def on_message(client, userdata, msg):
    try:
        payload = msg.payload.decode()
        topic = msg.topic
        
        if payload == 'true' or payload == 'false':
            for sensor in listaSensores:
                if topic == (TOPIC[0:-1] + sensor):
                    eval(f'Vaga{sensor}.objects.create(ocupada={payload.capitalize()})')
                    print(f"[MQTT] Dado recebido e salvo: {payload}")
        else:
            print("Dado inválido")

    except Exception as e:
        print(f"Erro ao processar mensagem MQTT: {e}")

def start_mqtt():
    client = mqtt.Client()
    client.on_connect = on_connect
    client.on_message = on_message

    client.connect(MQTT_BROKER, MQTT_PORT, 60)
    print("Iniciando loop MQTT...")
    client.loop_forever()

if __name__ == "__main__":
    start_mqtt()
