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
   LOGIN PAGE
========================= */

app.get('/',(req,res)=>{
res.render('login');
});

/* =========================
   LOGIN
========================= */

app.post('/login',(req,res)=>{

const {login_id,password}=req.body;

db.query(
"SELECT * FROM users WHERE login_id=? AND password=? AND status='approved'",
[login_id,password],
(err,result)=>{

if(err){
console.log(err);
return res.send("Database error");
}

if(result.length===0){
return res.send("Account not approved or invalid login.");
}

req.session.user=result[0];

if(result[0].role==='admin'){
return res.redirect('/admin');
}

res.redirect('/dashboard');

});

});

/* =========================
   LOGOUT
========================= */

app.get('/logout',(req,res)=>{
req.session.destroy(()=>{
res.redirect('/');
});
});

/* =========================
   REGISTER OPTIONS
========================= */

app.get('/register',(req,res)=>{
res.render('register');
});

app.get('/register/student',(req,res)=>{
res.render('register_student');
});

app.get('/register/teacher',(req,res)=>{
res.render('register_teacher');
});

/* =========================
   STUDENT REGISTER
========================= */

app.post('/register/student',(req,res)=>{

const {name,login_id,password,year,branch,section,mobile,email}=req.body;

db.query(
`INSERT INTO users
(name,role,login_id,password,year,branch,section,mobile,email,status)
VALUES (?,?,?,?,?,?,?,?,?,?)`,
[name,'student',login_id,password,year,branch,section,mobile,email,'pending'],
(err)=>{

if(err){
console.log(err);
return res.send("Registration error");
}

res.send("Student registered successfully. Wait for admin approval.");

});

});

/* =========================
   TEACHER REGISTER
========================= */

app.post('/register/teacher',(req,res)=>{

const {name,login_id,password,branch,mobile,email}=req.body;

db.query(
`INSERT INTO users
(name,role,login_id,password,branch,mobile,email,status)
VALUES (?,?,?,?,?,?,?,?)`,
[name,'teacher',login_id,password,branch,mobile,email,'pending'],
(err)=>{

if(err){
console.log(err);
return res.send("Registration error");
}

res.send("Teacher registered successfully. Wait for admin approval.");

});

});

/* =========================
   USER DASHBOARD
========================= */

app.get('/dashboard',(req,res)=>{

if(!req.session.user){
return res.redirect('/');
}

db.query(
`SELECT books.title,
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

db.query(
"UPDATE users SET status='approved' WHERE id=?",
[req.params.id],
()=>{
res.redirect('/admin');
});

});

/* =========================
   VIEW BOOKS
========================= */

app.get('/books',(req,res)=>{

db.query("SELECT * FROM books",(err,books)=>{

res.render("admin/books",{books});

});

});

/* =========================
   STUDENTS SEARCH
========================= */

app.get('/students',(req,res)=>{

const search=req.query.search;

if(!search){
return res.render("admin/students",{students:[]});
}

db.query(
`SELECT name,login_id,year,branch,mobile
FROM users
WHERE role='student'
AND status='approved'
AND login_id LIKE ?`,
[`%${search}%`],
(err,data)=>{

res.render("admin/students",{students:data});

});

});

/* =========================
   TEACHERS SEARCH
========================= */

app.get('/teachers',(req,res)=>{

const search=req.query.search;

if(!search){
return res.render("admin/teachers",{teachers:[]});
}

db.query(
`SELECT name,login_id,branch,mobile
FROM users
WHERE role='teacher'
AND status='approved'
AND login_id LIKE ?`,
[`%${search}%`],
(err,data)=>{

res.render("admin/teachers",{teachers:data});

});

});

/* =========================
   BOOK REQUEST PAGE
========================= */

app.get('/request',(req,res)=>{

db.query(
"SELECT * FROM books WHERE available_quantity>0",
(err,books)=>{
res.render('request-book',{books});
});

});

/* =========================
   BOOK REQUEST
========================= */

app.post('/request',(req,res)=>{

db.query(
"INSERT INTO book_requests(user_id,book_id,status) VALUES (?,?,?)",
[req.session.user.id,req.body.book,'pending'],
()=>{
res.redirect('/dashboard');
});

});

/* =========================
   ADMIN BOOK REQUESTS
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
   APPROVE BOOK REQUEST
========================= */

app.get('/approve/:id',(req,res)=>{

const id=req.params.id;

db.query(
"SELECT * FROM book_requests WHERE id=?",
[id],
(err,data)=>{

if(data.length===0){
return res.redirect('/requests');
}

const user=data[0].user_id;
const book=data[0].book_id;

db.query(
"SELECT COUNT(*) AS total FROM issued_books WHERE user_id=? AND status='issued'",
[user],
(err,count)=>{

if(count[0].total>=3){

db.query("DELETE FROM book_requests WHERE id=?",[id]);

req.session.message="User already has 3 books issued.";

return res.redirect('/requests');
}

db.query(
`INSERT INTO issued_books
(user_id,book_id,issue_date,due_date,status)
VALUES (?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 7 DAY),'issued')`,
[user,book]
);

db.query(
"UPDATE books SET available_quantity=available_quantity-1 WHERE id=?",
[book]
);

db.query("DELETE FROM book_requests WHERE id=?",[id]);

req.session.message="Book issued successfully.";

res.redirect('/requests');

});

});

});

/* =========================
   ISSUED BOOKS
========================= */

app.get('/issued',(req,res)=>{

const search=req.query.search || "";

db.query(
`SELECT users.name,users.login_id,
books.title,
issued_books.issue_date,
issued_books.due_date
FROM issued_books
JOIN users ON users.id=issued_books.user_id
JOIN books ON books.id=issued_books.book_id
WHERE issued_books.status='issued'
AND users.login_id LIKE ?`,
[`%${search}%`],
(err,data)=>{

res.render("admin/issued",{data,search});

});

});

/* =========================
   RETURNED BOOKS WITH FINE
========================= */

app.get('/returned',(req,res)=>{

const search=req.query.search || "";

db.query(
`SELECT users.name,users.login_id,
books.title,
issued_books.issue_date,
issued_books.return_date,
GREATEST(DATEDIFF(issued_books.return_date,issued_books.due_date),0) AS late_days,
GREATEST(DATEDIFF(issued_books.return_date,issued_books.due_date),0)*5 AS fine
FROM issued_books
JOIN users ON users.id=issued_books.user_id
JOIN books ON books.id=issued_books.book_id
WHERE issued_books.status='returned'
AND users.login_id LIKE ?`,
[`%${search}%`],
(err,data)=>{

res.render("admin/returned",{data,search});

});

});

/* =========================
   OVERDUE BOOKS
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
   RETURN PAGE
========================= */

app.get('/return',(req,res)=>{

db.query(
`SELECT issued_books.id,books.title
FROM issued_books
JOIN books ON books.id=issued_books.book_id
WHERE issued_books.user_id=? 
AND issued_books.status='issued'`,
[req.session.user.id],
(err,data)=>{

res.render("return-ticket",{books:data});

});

});

/* =========================
   RAISE RETURN REQUEST
========================= */

app.post('/return',(req,res)=>{

const issue_id=req.body.issue;

db.query(
"SELECT * FROM return_tickets WHERE issue_id=?",
[issue_id],
(err,result)=>{

if(result.length>0){
return res.redirect('/dashboard');
}

db.query(
"INSERT INTO return_tickets(issue_id,status) VALUES (?,?)",
[issue_id,'pending'],
()=>{
res.redirect('/dashboard');
});

});

});

/* =========================
   ADMIN RETURN REQUESTS
========================= */

app.get('/return-requests',(req,res)=>{

db.query(
`SELECT return_tickets.id,
users.name,
books.title
FROM return_tickets
JOIN issued_books ON issued_books.id=return_tickets.issue_id
JOIN users ON users.id=issued_books.user_id
JOIN books ON books.id=issued_books.book_id`,
(err,data)=>{

res.render("admin/return_requests",{returns:data});

});

});

/* =========================
   ACCEPT RETURN
========================= */

app.get('/accept-return/:id',(req,res)=>{

const id=req.params.id;

db.query(
"SELECT * FROM return_tickets WHERE id=?",
[id],
(err,data)=>{

const issue_id=data[0].issue_id;

db.query(
"SELECT * FROM issued_books WHERE id=?",
[issue_id],
(err,issue)=>{

const book_id=issue[0].book_id;

db.query(
"UPDATE issued_books SET status='returned',return_date=CURDATE() WHERE id=?",
[issue_id]
);

db.query(
"UPDATE books SET available_quantity=available_quantity+1 WHERE id=?",
[book_id]
);

db.query(
"DELETE FROM return_tickets WHERE id=?",
[id]
);

res.redirect('/return-requests');

});

});

});
/* =========================
   MY BOOKS (USER HISTORY)
========================= */

app.get('/my-books',(req,res)=>{

if(!req.session.user){
return res.redirect('/');
}

const sql = `
SELECT books.title,
issued_books.issue_date,
issued_books.due_date,
issued_books.return_date,
issued_books.status
FROM issued_books
JOIN books ON books.id = issued_books.book_id
WHERE issued_books.user_id = ?
ORDER BY issued_books.issue_date DESC
`;

db.query(sql,[req.session.user.id],(err,data)=>{

if(err){
console.log(err);
return res.send("Database error");
}

res.render("my-books",{books:data});

});

});

/* =========================
   SERVER
========================= */

app.listen(3000,()=>{
console.log("Server running on http://localhost:3000");
});