const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./config/db');

const app = express();

/* =========================
   BASIC CONFIG
========================= */
app.set('view engine','ejs');
app.use(bodyParser.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname,'public')));

app.use(session({
    secret:'librarysecret',
    resave:false,
    saveUninitialized:false
}));

/* =========================
   LOGIN
========================= */
app.get('/',(req,res)=> res.render('login'));

app.post('/login',(req,res)=>{
const {login_id,password}=req.body;

db.query(
"SELECT * FROM users WHERE login_id=? AND password=? AND status='approved'",
[login_id,password],
(err,result)=>{

if(err) return res.send("Database error");

if(result.length===0){
return res.send("Invalid login");
}

req.session.user=result[0];

if(result[0].role==='admin') return res.redirect('/admin');

res.redirect('/dashboard');

});
});

/* =========================
   LOGOUT
========================= */
app.get('/logout',(req,res)=>{
req.session.destroy(()=> res.redirect('/'));
});

/* =========================
   DASHBOARD (FIXED)
========================= */
app.get('/dashboard',(req,res)=>{

if(!req.session.user) return res.redirect('/');

db.query(
`SELECT issued_books.id,
books.title,
issued_books.issue_date,
issued_books.due_date
FROM issued_books
JOIN books ON books.id=issued_books.book_id
WHERE issued_books.user_id=? 
AND issued_books.status='issued'`,
[req.session.user.id],
(err,data)=>{

res.render('dashboard',{
user:req.session.user,
books:data
});

});
});

/* =========================
   EXTEND BOOK (NEW)
========================= */
app.get('/extend-book/:id',(req,res)=>{

const id=req.params.id;

db.query(
`UPDATE issued_books 
SET due_date = DATE_ADD(due_date, INTERVAL 7 DAY)
WHERE id=? AND status='issued'`,
[id],
(err)=>{

if(err) return res.send("Error extending");

res.redirect('/dashboard');

});
});

/* =========================
   ADMIN DASHBOARD
========================= */
app.get('/admin',(req,res)=>{

if(!req.session.user || req.session.user.role!=='admin'){
return res.redirect('/');
}

db.query("SELECT * FROM users WHERE status='pending'",(err,newUsers)=>{
res.render("admin/dashboard",{newUsers});
});
});

/* =========================
   APPROVE USER
========================= */
app.get('/approve-user/:id',(req,res)=>{
db.query("UPDATE users SET status='approved' WHERE id=?",
[req.params.id],
()=> res.redirect('/admin'));
});

/* =========================
   REQUEST BOOK
========================= */
app.get('/request',(req,res)=>{
db.query("SELECT * FROM books WHERE available_quantity>0",
(err,books)=> res.render('request-book',{books}));
});

app.post('/request',(req,res)=>{

if(req.session.user.role==='admin'){
return res.send("Admin cannot request books");
}

db.query(
"INSERT INTO book_requests(user_id,book_id,status) VALUES (?,?,?)",
[req.session.user.id,req.body.book,'pending'],
()=> res.redirect('/dashboard'));
});

/* =========================
   ADMIN REQUESTS
========================= */
app.get('/requests',(req,res)=>{

const message=req.session.message || null;
req.session.message=null;

db.query(
`SELECT book_requests.id,
users.name,
books.title
FROM book_requests
JOIN users ON users.id=book_requests.user_id
JOIN books ON books.id=book_requests.book_id`,
(err,requests)=>{

res.render('admin/requests',{requests,message});
});
});

/* =========================
   APPROVE REQUEST
========================= */
app.get('/approve/:id',(req,res)=>{

const id=req.params.id;

db.query("SELECT * FROM book_requests WHERE id=?",[id],(err,data)=>{

if(data.length===0) return res.redirect('/requests');

const user=data[0].user_id;
const book=data[0].book_id;

db.query(
"SELECT COUNT(*) AS total FROM issued_books WHERE user_id=? AND status='issued'",
[user],
(err,count)=>{

if(count[0].total>=3){
db.query("DELETE FROM book_requests WHERE id=?",[id]);
req.session.message="Max 3 books reached";
return res.redirect('/requests');
}

db.query(
`INSERT INTO issued_books
(user_id,book_id,issue_date,due_date,status)
VALUES (?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 7 DAY),'issued')`,
[user,book]
);

db.query("UPDATE books SET available_quantity=available_quantity-1 WHERE id=?",[book]);
db.query("DELETE FROM book_requests WHERE id=?",[id]);

req.session.message="Book issued successfully";

res.redirect('/requests');

});
});
});

/* =========================
   ISSUED BOOKS (FIXED)
========================= */
app.get('/issued',(req,res)=>{

const search=req.query.search;

if(!search){
return res.render("admin/issued",{data:[],search:""});
}

const sql=`
SELECT issued_books.id,
users.name,
users.login_id,
books.title,
issued_books.issue_date,
issued_books.due_date,
issued_books.status
FROM issued_books
JOIN users ON users.id=issued_books.user_id
JOIN books ON books.id=issued_books.book_id
WHERE issued_books.status='issued'
AND users.login_id LIKE ?
`;

db.query(sql,[`%${search}%`],(err,data)=>{
res.render("admin/issued",{data,search});
});
});

/* =========================
   RETURN BOOK (ADMIN DIRECT)
========================= */
app.get('/return-book/:id',(req,res)=>{

const id=req.params.id;

db.query("SELECT * FROM issued_books WHERE id=?",[id],(err,data)=>{

if(data.length===0) return res.redirect('/issued');

const book_id=data[0].book_id;

db.query("UPDATE issued_books SET status='returned',return_date=CURDATE() WHERE id=?",[id]);
db.query("UPDATE books SET available_quantity=available_quantity+1 WHERE id=?",[book_id]);

res.redirect('/issued');

});
});

/* =========================
   OVERDUE + FINE
========================= */
app.get('/overdue',(req,res)=>{

db.query(
`SELECT users.name,books.title,
issued_books.issue_date,
issued_books.due_date,
DATEDIFF(CURDATE(),issued_books.due_date) AS late_days,
DATEDIFF(CURDATE(),issued_books.due_date)*5 AS fine
FROM issued_books
JOIN users ON users.id=issued_books.user_id
JOIN books ON books.id=issued_books.book_id
WHERE issued_books.status='issued'
AND issued_books.due_date < CURDATE()`,
(err,data)=>{

res.render("admin/overdue",{data});

});
});

/* =========================
   SERVER
========================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT,()=>{
console.log("Server running on port "+PORT);
});