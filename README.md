# bch-nuker
creates lots of bitcoin transactions in a hurry

## Getting Started

### Prerequisites
 - NodeJS v8.x
 - NPM
 - A bitcoin node

### Installing
Install NodeJS and NPM
```
curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash -
sudo apt-get install -y nodejs
curl -L https://npmjs.org/install.sh | sudo sh
```

Clone bch-nuker repository and install dependencies
```
git clone https://github.com/joshuayabut/bch-nuker.git
cd bch-nuker
npm install
```

Update bitcoind RPC configuration (lines 17-21 in index.js)
```
nano index.js
```
*Example*:
```
 16 var config = {
 17   protocol: 'http',
 18   user: 'user',
 19   pass: 'passasdasdsa123',
 20   host: '127.0.0.1', // 127.0.0.1
 21   port: '18332', // 18332
 22 };
```

### Running
Ensure you have some coins in the wallet prior to running.
```
node index.js
```

## Contributing
Yes. Please do.

## Authors
* **Joshua Yabut** - *Initial work* - [movrcx](https://github.com/joshuayabut)

See also the list of [contributors](https://github.com/your/project/contributors) who participated in this project.

## License
This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details

