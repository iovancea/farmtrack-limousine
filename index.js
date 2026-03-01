const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 🐂 RUTA 1: ÎNREGISTRARE FĂTARE (Calcul Genetic + Verificare 2 ani)
app.post('/api/fatare', async (req, res) => {
    try {
        const { dam_tag, calf_tag, gender, birth_date, bull_id } = req.body;

        // 1. VALIDĂRI DE BAZĂ (Input Validation)
        if (!dam_tag || !calf_tag || !birth_date || !bull_id) {
            return res.status(400).json({ error: "Lipsesc date! Te rugăm să completezi toate câmpurile obligatorii." });
        }

        if (!['M', 'F'].includes(gender)) {
            return res.status(400).json({ error: "Genul trebuie să fie 'M' (Mascul) sau 'F' (Femelă)." });
        }

        const inputDate = new Date(birth_date);
        if (inputDate > new Date()) {
            return res.status(400).json({ error: "Data fătării nu poate fi în viitor!" });
        }

        // 2. VERIFICARE EXISTENȚĂ MAMĂ
        const { data: dam, error: damError } = await supabase
            .from('animals')
            .select('id, purity_percentage, birth_date, tag_id')
            .eq('tag_id', dam_tag)
            .single();

        if (damError || !dam) {
            return res.status(404).json({ error: `Mama cu crotalul ${dam_tag} nu a fost găsită în sistem.` });
        }

        // 3. LOGICA DE VÂRSTĂ (Minim 2 ani / 730 zile)
        const diffTime = Math.abs(inputDate - new Date(dam.birth_date));
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays < 730) {
            const aniMama = (diffDays / 365).toFixed(1);
            return res.status(400).json({ 
                error: `Validare eșuată: Mama are doar ${aniMama} ani. Limousine FarmTrack impune minim 2 ani pentru fătare.` 
            });
        }

        // 4. CALCUL GENETIC
        // Taurul (bull_id) este mereu 100%. Puritatea vițelului = (Mama + 100) / 2
        const calfPurity = (parseFloat(dam.purity_percentage) + 100) / 2;

        // 5. INSERARE ÎN BAZA DE DATE
        const { data: newCalf, error: insertError } = await supabase
            .from('animals')
            .insert([{
                tag_id: calf_tag,
                gender: gender,
                birth_date: birth_date,
                purity_percentage: calfPurity,
                dam_id: dam.id,
                bull_id: bull_id,
                status: 'activ',
                is_active: true
            }])
            .select();

        // Gestionare eroare Crotal Duplicat (Eroarea 23505 în Postgres)
        if (insertError) {
            if (insertError.code === '23505') {
                return res.status(409).json({ error: `Crotalul ${calf_tag} există deja în baza de date!` });
            }
            throw insertError;
        }

        // 6. RĂSPUNS DE SUCCES
        res.status(201).json({
            status: "Succes",
            mesaj: `Vițelul ${calf_tag} a fost înregistrat cu succes.`,
            detalii: {
                puritate: `${calfPurity}%`,
                generatie: calfPurity >= 93.75 ? "Rasă Pură (F3)" : calfPurity >= 87.5 ? "F2" : "F1",
                eligibil_certificat: calfPurity >= 75
            }
        });

    } catch (err) {
        console.error("Eroare Server:", err);
        res.status(500).json({ error: "A apărut o eroare neprevăzută la server. Contactați administratorul." });
    }
});


// 📉 RUTA 2: IEȘIRE ANIMAL (Schimbare Status)
app.put('/api/iesire/:tag', async (req, res) => {
    const { tag } = req.params;
    const { data_iesire, motiv } = req.body;

    const { error } = await supabase.from('animals')
        .update({ exit_date: data_iesire, exit_reason: motiv, is_active: false, status: 'iesit' })
        .eq('tag_id', tag);

    if (error) return res.status(500).json(error);
    res.json({ mesaj: "Ieșire înregistrată cu succes." });
});

// 📈 RUTA 3: STATISTICI ANUALE
app.get('/api/statistici', async (req, res) => {
    const { data, error } = await supabase.from('v_statistici_anuale').select('*');
    res.json(data);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`FarmTrack Limo activ pe portul ${PORT}`));
