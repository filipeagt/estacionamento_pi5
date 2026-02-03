#include <ESP8266WiFi.h> 
#include <PubSubClient.h>

//WiFi
const char* SSID = "filipe-HP-G42-Notebook-PC";                // SSID / nome da rede WiFi que deseja se conectar
const char* PASSWORD = "SXaeaHER";   // Senha da rede WiFi que deseja se conectar
WiFiClient wifiClient;                        
 
//MQTT Server
const char* BROKER_MQTT = "test.mosquitto.org"; //URL do broker MQTT que se deseja utilizar
int BROKER_PORT = 1883;                      // Porta do Broker MQTT

#define ID_MQTT  "LhczCQYoOBMMFQU5ABUbFTI" //Informe um ID unico e seu. Caso sejam usados IDs repetidos a ultima conexão irá sobrepor a anterior. 
#define TOPIC "pi5/estacionamento/vaga/A01"    //Cada sensor deve ter um número diferente para sua vaga
//#define USUARIO_MQTT "LhczCQYoOBMMFQU5ABUbFTI" //Usúario do broker
//#define SENHA_MQTT "XuVt0v7/G3VDLhD+JRSV3UhS" //Senha do broker
PubSubClient MQTT(wifiClient);        // Instancia o Cliente MQTT passando o objeto espClient

//Conexão do sensor
#define echoPin 3 //Conectar por um resistor de 1k para limitar a corrente no boot, ao ligar o pino3 inicia em high
#define trigPin 1 //0,1 e 2 se conecatdos a LOW na inicialização da falha no boot, então o esp não iniciliza se ligados no echo

//LEDs para indicação luminosa
#define ledVermelho 0
#define ledVerde    2

unsigned long duracao; //tempo que q a onda trafega
unsigned int distancia; //distância medida em cm

unsigned long tempoAnterior = 0;//Váriavel que armazena o tempo em ms desde que o programa está rodando
const long intervalo = 10000;//10 segundos, intervalo para enviar dados

//Declaração das Funções
void mantemConexoes();  //Garante que as conexoes com WiFi e MQTT Broker se mantenham ativas
void conectaWiFi();     //Faz conexão com WiFi
void conectaMQTT();     //Faz conexão com Broker MQTT
void medeDistancia();   //Mede distância de um objeto ao sensor para verificar se tem um carro estacionado
void enviaDado();

void setup() {
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);

  pinMode(ledVermelho, OUTPUT);
  pinMode(ledVerde, OUTPUT);

  conectaWiFi();
  MQTT.setServer(BROKER_MQTT, BROKER_PORT);
}

void loop() {
  unsigned long tempoAtual = millis();

  mantemConexoes();
  if (tempoAtual - tempoAnterior >= intervalo) { //Envia  o dado de acordo com o intervalo definido
    tempoAnterior = tempoAtual;
    enviaDado();
  }
  MQTT.loop();  

  delay(0); //Delay para o wifi funcionar corretamente
}

void mantemConexoes() {

  if (WiFi.status() != WL_CONNECTED) {  //se não há conexão com o WiFI, a conexão é refeita
    conectaWiFi(); 
  }

  if (!MQTT.connected()) {  //Se não estiver conectado ao broker, reconecta
    conectaMQTT(); 
  }    
    
}

void conectaWiFi() {

  WiFi.mode(WIFI_STA); //Configura o esp como estação
  WiFi.begin(SSID, PASSWORD); // Conecta na rede WI-FI  
  while (WiFi.status() != WL_CONNECTED) {
      //Pisca luz amarela rapidamente (~5Hz) para indicar falha na conexão WiFi
      digitalWrite(ledVermelho, HIGH);
      digitalWrite(ledVerde, HIGH);
      delay(100);
      digitalWrite(ledVermelho, LOW);
      digitalWrite(ledVerde, LOW);
      delay(100);
  }

}

void conectaMQTT() { 
    while (!MQTT.connected()) {

        if (!MQTT.connect(ID_MQTT/*, USUARIO_MQTT, SENHA_MQTT*/)) {
          //Pisca luz amarela lentamente (~1Hz) para indicar falha de conexão MQTT
          for (int i = 0 ; i < 10 ; i++) {
            digitalWrite(ledVermelho, HIGH);
            digitalWrite(ledVerde, HIGH);
            delay(500);
            digitalWrite(ledVermelho, LOW);
            digitalWrite(ledVerde, LOW);
            delay(500);
          }
        } 
    }
}

void medeDistancia() {

  digitalWrite(trigPin, LOW);//Limpa a condição do trigPin
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);//Seta em nível alto por 10 microsegundos
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  duracao = pulseIn(echoPin, HIGH); //Retorna o tempo que a onda trafegou
  distancia = duracao * 0.034 / 2; // Velocidade do som dividida por 2 (ida e volta)
}

void enviaDado() { 
  medeDistancia();
  if (distancia > 200) { //A vaga está livre, acende a luz verde
    digitalWrite(ledVermelho, LOW);
    digitalWrite(ledVerde, HIGH);
    MQTT.publish(TOPIC, "false");   //NÃO tem carro envia "false"

  } else if (distancia < 180 && distancia != 0) {  //Vaga ocupada, acende luz vermelha
    digitalWrite(ledVerde, LOW);
    digitalWrite(ledVermelho, HIGH);
    MQTT.publish(TOPIC, "true");    //Tem carro envia "true"

  } else if (distancia == 0) {  //Sensor com falha, acende luz amarela e não envia dados
    digitalWrite(ledVermelho, HIGH);
    digitalWrite(ledVerde, HIGH);
  }
}
