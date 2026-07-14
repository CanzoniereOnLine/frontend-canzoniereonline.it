---
title: "Novità"
description: "Cosa cambia con la nuova verisione"
order: 1
section: "Guida"
---

Rispetto alla vecchia versione del sito, abbiamo fatto qualche passo avanti soprattutto a livello di architettura. Ora il repository che ospita le canzoni, quando viene aggiornato, analizza tutte le canzoni e genera un database sqlite scaricabile da github.

Il database viene sfruttato da un servizio scritto in GO che espone una serie di API per mostrare le canzoni, cercarle e anche compilare i canzonieri. 

Il servizio gira su un container docker con le dipendenze minime per la compilazione in Latex, e si appoggia poi ad un bucket S3 per il download dei file e il salvataggio delle metainformazioni. 

Il sito invece è un sito statico costruito con astro, che recupera proprio da queste API le informazioni sulle canzoni.

Tutto sta su github, tutto liberamente scaricabile, tutto migliorabile (benvenute pull request)!
