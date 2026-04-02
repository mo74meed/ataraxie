const text = "Citer les indications de l'examen extemporané en cas de tumeur du système nerveux central. - Examen extemporané des tumeurs cérébrales : indication et intérêt. Quel est l'intérêt et les indications de l'examen extemporané en pathologie tumorale cérébrale ? Et quels sont les éléments cliniques à prendre en considération lors de l'examen ?";
let newText = text.replace(/([.?])\s+(?=-|[A-Z])/g, "$1\n");
console.log(text === newText);
console.log(JSON.stringify(newText));
