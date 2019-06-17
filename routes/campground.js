
var express = require("express");
var router = express.Router();
var Campground = require("../models/campground");
var Comment = require("../models/comment");
var middleware = require("../middleware");    //will require index.js automatically
var NodeGeocoder = require('node-geocoder');
var Review = require("../models/review");
var multer = require('multer');

var storage = multer.diskStorage({
  filename: function(req, file, callback) {
    callback(null, Date.now() + file.originalname); //creating the name for the image
  }
});
var imageFilter = function (req, file, cb) {
    // accept image files only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/i)) {
        return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
};
var upload = multer({ storage: storage, fileFilter: imageFilter});

var cloudinary = require('cloudinary');
cloudinary.config({ 
  cloud_name: 'drhcip4sz', 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET
});

 
var options = {
  provider: 'google',
  httpAdapter: 'https',
  apiKey: process.env.GEOCODER_API_KEY,
  formatter: null
};
 
var geocoder = NodeGeocoder(options);

//INDEX  - Show all campgrounds
router.get("/", function(req, res){
    var noMatch=null;
    var perPage = 8;
    var pageQuery = parseInt(req.query.page);
    var pageNumber = pageQuery ? pageQuery: 1;
    if(req.query.search){
        const regex = new RegExp(escapeRegex(req.query.search),'gi');
         Campground.find({name: regex}, function(err, allCampgrounds){
              if(err){
                  console.log(err);
              } else{
                  if(allCampgrounds.length <1){
                      noMatch = "No campgrounds match that query, please try again.";
                  }
                    res.render("campgrounds/index",{campgrounds:allCampgrounds, page: 'campgrounds', noMatch: noMatch});
                }
         });
    } else{
    
       //Get all campgrounds from DB
       Campground.find({}).skip((perPage * pageNumber)-perPage).limit(perPage).exec(function(err, allCampgrounds){
           Campground.count().exec(function(err, count){
                if(err){
                    console.log(err);
                } else{
                    res.render("campgrounds/index",{
                        campgrounds:allCampgrounds, 
                        page: 'campgrounds',
                        noMatch: noMatch, 
                        current: pageNumber, 
                        pages: Math.ceil(count/perPage)});
                    }
            });
        });
    }
});

//CREATE - add new campground to DB
router.post("/", middleware.isLoggedIn, upload.single('image'), function(req, res) {  // get data from form and add to campgrounds array
   var name = req.body.name;
   var image = req.body.image;
   
     var desc = req.body.description;
     var author = {
       id: req.user._id,
       username: req.user.username
    };
    var price = req.body.price;
    
  geocoder.geocode(req.body.location, function (err, data) {
             
     if (err || !data.length) {
              req.flash('error', 'Invalid address');
              console.log(err, data);
              return res.redirect('back');
       }
       
      var lat = data[0].latitude;
      var lng = data[0].longitude;
      var location = data[0].formattedAddress;
      
    cloudinary.v2.uploader.upload(req.file.path, function(error,result) {
      // add cloudinary url for the image to the campground object under image property
      image = result.secure_url;  
      var imageId = result.public_id;
      var newCampground = {name: name, price: price, image: image, description: desc, author:author, location: location, lat: lat, lng: lng, imageId: imageId };
   
    Campground.create(newCampground, function(err, newlyCreated){
        if(err){
            req.flash('error', err.message);
            return res.redirect('back');
        } else {
            //redirect back to campgrounds page
            req.flash("success", "Successfully Updated!");
            res.redirect("/campgrounds");
        }
    });
  });
});
});

//NEW - show form to create new campground
router.get("/new",middleware.isLoggedIn,function(req, res){
   res.render("campgrounds/new"); 
});



// SHOW - shows more info about one campground
router.get("/:id", function(req, res){
   //find the campground with provided ID
   Campground.findById(req.params.id).populate("comments").populate({
       path: "reviews",
       options: {sort: {createdAt: -1}}
   }).exec(function(err, foundCampground){
       if(err){
           console.log(err);
       }else{
           res.render("campgrounds/show", {campground: foundCampground});
       }
   });
   //render show template with that campground
});

//EDIT Campground Routes
router.get("/:id/edit", middleware.checkCampgroundOwnership, function(req, res){
    Campground.findById(req.params.id, function(err, foundCampground){
        res.render("campgrounds/edit",{campground: foundCampground});
    });
    });

// UPDATE CAMPGROUND ROUTE
router.put("/:id", upload.single('campground[image]'), middleware.checkCampgroundOwnership,  function(req, res){
  
  geocoder.geocode(req.body.campground.location, function (err, data) {
    if (err || !data.length) {
      req.flash('error', 'Invalid address');
      console.log(err);
      return res.redirect('back');
    }
    var lat = data[0].latitude;
    var lng = data[0].longitude;
    var location = data[0].formattedAddress;
    delete req.body.campground.rating;
    
    if (req.file) {
        cloudinary.uploader.upload(req.file.path, function (result) {
            req.body.campground.image = result.secure_url;
       
            var newData = { name: req.body.campground.name, image: req.body.campground.image, description: req.body.campground.description, price: req.body.campground.price, location: location, lat: lat, lng: lng };


            //Updated Data Object
            Campground.findByIdAndUpdate(req.params.id, newData, function (err, campground) {
                if (err) {
                    //Flash Message
                    req.flash("error", err.message);

                    //Redirects Back
                    res.redirect("back");
                }
                else {
                    //Flash Message
                    req.flash("success", "Successfully Updated!");

                    //Redirects To Edited Campground
                    res.redirect("/campgrounds/" + campground._id);
                }
            }); //End Campground/findBoyIdAndUpdate
        });
    }
    else{
        var newData = { name: req.body.campground.name, image: req.body.campground.image, description: req.body.campground.description, price: req.body.campground.price, location: location, lat: lat, lng: lng };
        Campground.findByIdAndUpdate(req.params.id, newData, function (err, campground) {
                if (err) {
                    //Flash Message
                    req.flash("error", err.message);
                    console.og(err);
                    //Redirects Back
                    res.redirect("back");
                }
                else {
                    //Flash Message
                    req.flash("success", "Successfully Updated!");

                    //Redirects To Edited Campground
                    res.redirect("/campgrounds/" + campground._id);
                }
            }); //Ends Cloudinary Image Upload
        }
   });
});

// DESTROY CAMPGROUND ROUTE
router.delete("/:id", middleware.checkCampgroundOwnership, function (req, res) {
    Campground.findById(req.params.id, function (err, campground) {
        if (err) {
            res.redirect("/campgrounds");
        } else {
            // deletes all comments associated with the campground
            Comment.remove({"_id": {$in: campground.comments}}, function (err) {
                if (err) {
                    console.log(err);
                    return res.redirect("/campgrounds");
                }
                // deletes all reviews associated with the campground
                Review.remove({"_id": {$in: campground.reviews}}, function (err) {
                    if (err) {
                        console.log(err);
                        return res.redirect("/campgrounds");
                    }
                    cloudinary.v2.uploader.destroy(campground.image, function(err){
                        if (err) {
                            console.log(err);
                            return res.redirect("/campgrounds");
                        }
                        //delete the campground
                            campground.remove();
                            req.flash("success", "Campground deleted successfully!");
                            res.redirect("/campgrounds");
                    });
                });
                
            });
            
        }
    });
});


function escapeRegex(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

module.exports = router;