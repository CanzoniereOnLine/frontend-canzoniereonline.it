---
title: "Come siamo arrivati qui - la parte tecnologica" 
description: "Qualche riga di spiegazione dell'architettura e delle scuse per tutti quelli che negli anni non siamo riusciti a coinvolgere nello svecchiamento del sito"
order: 2
section: "Guida"
---

Che il sito di canzonieronline avesse bisogno di essere rinnovato ci era chiaro da tempo. Non tanto per la sua veste grafica - questa che state leggendo temo sia per molti versi anche peggiore - quanto per la piattaforma tecnologica sulla quale si appoggiava: un VPS ubuntu con installato LaTeX, una servizio in nodejs per la compilazione dei canzonieri e una pipeline artigianale per la compilazione del sito con HuGo. Niente di terribilmente _legacy_, come dicono quelli, ma tutto tenuto in piedi da modifiche manuali fatte direttamente sul server, quando qualcosa smetteva di funzionare. 

Nel corso degli anni, molte persone ci hanno scritto per chiedere se potevano dare una mano nel rinnovare il sito. Non abbiamo mai accolto queste disponibilità, e di questo ci scusiamo. Non è mai stato per gelosia rispetto al progetto ma solo per mancanza di tempo. Tempo che comunque serve, anche solo per coordinare uno sviluppo, e nella vecchia infrastruttura ne sarebbe servito molto, anche solo per spiegare il giro di script e configurazioni che teneva in piedi il servizio.

Da un paio d'anni quindi abbiamo cominciato ad immaginare un rinnovo totale. Basta server VPS, si abbraccia una filosofia più _serverless_ - o, meglio, di delega nella gestione dell'infrastruttura - basata su container, si agganciano i servizi direttamente ai repository in modo che il codice sia più trasparente per tutti. Qualche tentativo lo avevamo fatto, ma la strada sembrava comunque molto lunga. Fino a quando, diciamolo chiaramente, non è arrivata l'AI. I piani gratuiti sono stati sufficienti per trasformare le idee - piuttosto chiare - sull'architettura in qualche migliaio di righe di codice. Verboso, non particolarmente elegante in molti suoi tratti, ma funzionante. (Benvenute PR se qualcuno vuole rimettere ordine :) )

Così ora abbiamo il repository delle canzoni, che genera in automatico un db SQLITE quando viene modificato. 
Un repository dedicato alla parte di backend, scritto in GO, che gira su un container ad hoc con installato una versione super essenziale di LaTeX - giusto quel che serve per compilare i canzonieri, che poi è agganciato ad un'App di digitalocean.
E infine un repository per la parte di frontend, che viene ospitata da cloudflare.

Tutto estremamente migliorabile, ma tutto finalmente pronto ad accogliere i contributi in maniera trasparente! Se qualcuno vuole modificare qualcosa, se pensa che sarebbe interessante aggiungere una nuova funzione (o una nuova canzone!) può scriverci o scrivere direttamente una PR! Con parsimonia, che conoscendoci non saremo comunque rapidissimi a rispondere, e con prudenza, che tra le cose che non abbiamo ancora implementato è una suite di test per verificare che non ci siano regressioni nel codice al nuovo deploy. 

Speriamo che il nuovo canzoniere vi piaccia, che renda più semplice collaborare per migliorarlo. 

Buone cantate a tutti!
