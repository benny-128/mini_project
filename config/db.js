const mysql = require("mysql2");

const connection = mysql.createConnection({
host: process.env.MYSQLHOST,
user: process.env.MYSQLUSER,
password: process.env.MYSQLPASSWORD,
database: process.env.MYSQLDATABASE,
port: process.env.MYSQLPORT
});

connection.connect(function(err){
if(err){
console.log("Database connection failed:",err);
}else{
console.log("Railway MySQL Connected");
}
});

module.exports = connection;