const str = "Citer les indications de l'examen extemporané en cas de tumeur du système nerveux central. - Examen extemporané des tumeurs cérébrales : indication et intérêt. Quel est l'intérêt et les indications de l'examen extemporané en pathologie tumorale cérébrale ? Et quels sont les éléments cliniques à prendre en considération lors de l'examen ?";

const fixed = str.replace(/(\?|\.)\s+(?=-|[A-Z])/g, '\\n');
console.log(fixed);
