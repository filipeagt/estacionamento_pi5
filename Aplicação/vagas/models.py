from django.db import models
from vagas.sensores import listaSensores

for sensor in listaSensores:
    exec(f"""
class Vaga{sensor}(models.Model):
    ocupada = models.BooleanField()
    data_hora = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f""" + "'{self.data_hora} - {self.ocupada}'"
         )

