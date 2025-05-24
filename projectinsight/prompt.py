i want to buid a demo crypto website, now it will have both admin panel which can be used to access the user and thier information. and also the main web for the user
now, it will have create accounts, login, reset password, for the user, now when the user want to signup, it should have firstname, lastname, email, country, phone nuber, password, Account Currency, country, like the default normal currency for the account, now for currency, there wuld be USD
EUR
GBP
RUB
JPY
CNY
CAD
AUD
CHF
INR
ZAR
also it should have referrer code, so, when the now most of these will be saved in the database as text right, expet for some like email, password etc, including referrer, currency, name, etc
now for after signup, email confirmation not needed, when user sign up it should just login automatically, now during the signup process, each user will also have thier own crypto currency in the database, now i have a code that generates wallets for each user, now when the user click signup, it shoud run the code, generate the wallets, the code example of generated wallet is below:

[
  {
    "coinName": "USD Coin",
    "shortName": "usdc",
    "walletAddress": "here",
    "privateKey": "here"
  },
  {
    "coinName": "Tether",
    "shortName": "usdt",
    "walletAddress": "here",
    "privateKey": "here"
  },
  {
    "coinName": "Solana",
    "shortName": "sol",
    "walletAddress": "H1QzrFmdDfrYFrmf2pftRJ2FsJYQYGGwzNv2Y8MnbPfX",
    "privateKey": "here"
  },
  {
    "coinName": "Shiba Inu",
    "shortName": "shib",
    "walletAddress": "here",
    "privateKey": "here"
  },
  {
    "coinName": "Ethereum",
    "shortName": "eth",
    "walletAddress": "here",
    "privateKey": "here"
  },
  {
    "coinName": "Pepe",
    "shortName": "pepe",
    "walletAddress": "here",
    "privateKey": "here"
  },
  {
    "coinName": "Cardano",
    "shortName": "ada",
    "walletAddress": "here",
    "privateKey": "here"
  },
  {
    "coinName": "Vechain",
    "shortName": "vet",
    "walletAddress": "here",
    "privateKey": "here"
  },
  {
    "coinName": "Cronos",
    "shortName": "cro",
    "walletAddress": "here",
    "privateKey": "here"
  },
  {
    "coinName": "Dogecoin",
    "shortName": "doge",
    "walletAddress": "here",
    "privateKey": "here"
  },
  {
    "coinName": "Bitcoin",
    "shortName": "btc",
    "walletAddress": "here",
    "privateKey": "here"
  },
  {
    "coinName": "Stellar",
    "shortName": "xlm",
    "walletAddress": "here",
    "privateKey": "here"
  },
  {
    "coinName": "Ripple",
    "shortName": "xrp",
    "walletAddress": "here",
    "privateKey": "here"
  },
  {
    "coinName": "Litecoin",
    "shortName": "ltc",
    "walletAddress": "here",
    "privateKey": "here"
  },
  {
    "coinName": "Binance Coin BNB",
    "shortName": "bnb",
    "walletAddress": "here",
    "privateKey": "here"
  },
  {
    "coinName": "USDC",
    "shortName": "usdc_spl",
    "walletAddress": "here",
    "privateKey": "pk here"
  }
]

now you know what will be in the database too, ensure the databasse give room for adding more coin. they should be saved as text to, no encryption, dont worry abotu security, ill encrypt myself later, i want to make my own encryption algorithm, now when user signup, there should also be verification, like id verification, like a section in the database, for verified, not veirifed, that can be modified too by the admin. why am i giving you these detailed, i want you to make the backend first and some basic front end and to ensure these database can be modified, accesed, etc, when we are making the frontend, also each of these coin should have balance too, 
also there will be soemthing in the database too, like plan, the user can subscribe to plan, so, the plan amount in the databasse, and if also the plan itself, ther will be 5 plan Basic plan, Premium plan, Gold plan, Pro plan, Expert plan, so it should have something to identify which one the user subscribe for and the amount, like i stated earlier, plan amount, so the plan amount for each. now each user will also have these, like wallet section, each of these will have wallet name, which are below, the wallet name already below so each wallet name will just have one text box so each of the wallet can store a text access it, edit

Aktionariat Wallet
Binance
Bitcoin Wallet
Bitkeep Wallet
Bitpay
Blockchain
Coinbase
Coinbase One
Crypto Wallet
Exodus Wallet
Gemini
Imtoken
Infinito Wallet
Infinity Wallet
Keyringpro Wallet
Metamask
Ownbit Wallet
Phantom Wallet
Pulse Wallet
Rainbow
Robinhood Wallet
Safepal Wallet
Sparkpoint Wallet
Trust Wallet
Uniswap
Wallet io

i just added it just incase we need it for something, so they just store a text, each of those.

now apart from that referrer code esrlier, that is the refferrer code of the person that referred the user, the user should also have its own refeerrrr code that is generated when the create account, just a random string with both upercase lowercase, number, and the lenght should be 8.
also stored in databse, these ensure its also modifiable and editable and accessible.
now also there should be deposit and withfraw history, for withdraw the database should have a text entry of these Date
Reference
Method
Amount
Total
Status
deposit also these
Date
Reference
Method
Type
Amount
Total (EUR)

also each should have statrus , in withdraw there are 3 status possible, succesfull, pending, canceled, in deposit, there is pending confirmation, confirmed, canceled, also if a deposit is pending confirmation for 2 hour itll be canceled automatically,
also another stuff fo each usee, its called signal and each should have balance in the database
signal plans are ACD-Pro, CD V5 Pro, XPN-4N, BC-IRS, BC-IRS LEVEL2 Pro, TASANA Pro, RBF V6 25000, SILVER Pro WAYXE Pro, its just like the subscribe one too where each have balance/amount, now another one

stake, just loke signal and plan, the follwing shoud also have balance Avalanche, Ethereum, Polygon, Solana, Tether
also you know by default they are 0, also the plan, the signal, the stake, default they are 0, and just plain number right, since we can just add the curreny sign etc in the frontend.

also i forgot, in the referrer one, not just the generated referrer, also the databse should have number of referrers, earned amount 

now i think thats all, most of these things can ba saved as text and number, now what we are doing is to make the backend, thats what i need you to do, i need the backend made, everything i said, add them, think outside the box, i might not have said somethings right, but as a profresional that you are, you should know how to make things, the loign signup, etc, when the user login they dont need to login on that browser again only if the logout themself, etc, im just saying things that you should take into consideration when making the backend and the database, so no frontend yet, just trhe backend, endpouint etc, i dont know, like you need to make the backend, then givr mr all the enifomation i need to send to my frontend developer so he can develop amything with that backend, i wont send him the backend, i will just deploy it, send him the infomation you send me, so he can use it to develop a frontend for my backend, i understand the frontend dev does not need access to the backernd code to make frontend for it, but i just need you to prepare the backend, in such a way that it will be convinient for huim to make a frontend to do anything with the backend. i dontknow how but just do it, seens it requres an endpoint or something i dont know, also ensure the information that i need to send to my dev is detailed, like eveyrthting he needs for his conviniency, now make the codes, thibk outside the box, and do a greate job, for database, i think sqlite can doit roght or whatever you think would be ok for this. just make sometjhing cool and perfect in nodejs for me


 
